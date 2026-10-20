import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { Quote } from "./contracts";
import type { OperationalEventSession } from "./operational-schedule.server";
import { lockFinancialExecution } from "../finance/execution.server";
import {
  assertApprovedFinancialLessonInTransaction,
  type FinancialLessonAdmission,
} from "../finance/context.server";

export async function expireHolds(sql: Sql, now = new Date()) {
  await lockFinancialExecution(sql);
  // Lock the same order rows used by fulfillment. Expiration must never release
  // occupancy underneath a webhook that has already committed payment.
  const expired = await sql<{ id: string }>`select id from commerce_orders
    where status in ('pending','pending_fee','failed') and (hold_until <= ${now.toISOString()} or exists(select 1 from booking_records b where b.order_id=commerce_orders.id and b.status='held' and b.starts_at<=${now.toISOString()}))
    for update skip locked`;
  const ids = expired.map((row) => row.id);
  if (!ids.length) return;
  await sql`delete from booking_occupancy where booking_id in (
    select id from booking_records where status = 'held' and order_id = any(${ids}::text[]))`;
  await sql`update booking_records set status = 'expired' where status = 'held' and order_id = any(${ids}::text[])`;
  await sql`update commerce_orders set status = 'expired',updated_at=now() where id = any(${ids}::text[])`;
}

export async function holdWindow(
  sql: Sql,
  input: {
    orderId: string | null;
    userId: string | null;
    athleteId: string | null;
    coachId?: string;
    lessonSport?: "baseball" | "softball";
    lessonConfig?: Record<string, unknown>;
    productId: string;
    start: Date;
    end: Date;
    resources: string[];
    participantCount?: number;
    /** Server-resolved delivery overlay; financial booking inputs remain original. */
    operationalSession?: OperationalEventSession;
  },
) {
  await lockFinancialExecution(sql);
  if (input.start >= input.end || !input.resources.length)
    throw new Error("Invalid booking window.");
  if (input.orderId)
    await assertApprovedFinancialLessonInTransaction(sql, {
      coachId: input.coachId || null,
      productId: input.productId,
      startsAt: input.start,
      endsAt: input.end,
    });
  const id = randomUUID();
  const resources = [
    ...new Set([...input.resources, ...(input.athleteId ? [`athlete:${input.athleteId}`] : [])]),
  ];
  await sql`insert into booking_records (id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,participant_count,participants_verified)
    values (${id},${input.orderId},${input.userId},${input.athleteId},${input.coachId || null},${input.productId},
      ${input.start.toISOString()},${input.end.toISOString()},${JSON.stringify(resources)}::jsonb,${input.participantCount || 1},${Boolean(input.athleteId)})`;
  if (input.athleteId)
    await sql`insert into booking_participants(booking_id,athlete_id) values(${id},${input.athleteId})`;
  for (const resource of resources.sort()) {
    for (let ms = input.start.getTime(); ms < input.end.getTime(); ms += 300_000) {
      await sql`insert into booking_occupancy (resource_id,slot_at,booking_id) values (${resource},${new Date(ms).toISOString()},${id})`;
    }
  }
  return id;
}

/** Allocate occupancy only for a paid order. A conflict leaves no booking behind.
 * Every writer acquires occupancy in the same order; the unique resource/time
 * key prevents two successful payments from booking the same space.
 */
export async function createPaidBooking(sql: Sql, input: Parameters<typeof holdWindow>[1]) {
  await lockFinancialExecution(sql);
  const [paid] = await sql<{
    id: string;
    snapshot: { financialLessonAdmission?: FinancialLessonAdmission | null };
  }>`select id,snapshot from commerce_orders where id=${input.orderId} and status='paid' for update`;
  if (!paid) throw new Error("Successful payment is required before booking.");
  const delivery = input.operationalSession;
  const occupancyStart = delivery ? new Date(delivery.startsAt) : input.start;
  const occupancyEnd = delivery ? new Date(delivery.endsAt) : input.end;
  const cancelled = delivery?.status === "cancelled";
  if (
    input.start >= input.end ||
    (!cancelled && occupancyStart <= new Date()) ||
    !input.resources.length
  )
    return null;
  const pin = paid.snapshot.financialLessonAdmission;
  const originalAdmission =
    pin &&
    pin.coachId === input.coachId &&
    pin.productId === input.productId &&
    +new Date(pin.startsAt) === +input.start &&
    +new Date(pin.endsAt) === +input.end;
  await assertApprovedFinancialLessonInTransaction(sql, {
    coachId: input.coachId || null,
    productId: input.productId,
    startsAt: input.start,
    endsAt: input.end,
    basisVersion: originalAdmission ? pin.basisVersion : undefined,
  });
  const id = randomUUID();
  const resources = [
    ...new Set([...input.resources, ...(input.athleteId ? [`athlete:${input.athleteId}`] : [])]),
  ].sort();
  // A prospective active booking INSERT also creates an immutable financial
  // binding. Roll back the provisional booking AND binding on a slot conflict;
  // deleting the booking would violate that binding's historical foreign key.
  await sql.query("savepoint financial_paid_booking");
  await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,participant_count,participants_verified,status,lesson_sport,lesson_config)
    values(${id},${input.orderId},${input.userId},${input.athleteId},${input.coachId || null},${input.productId},${input.start.toISOString()},${input.end.toISOString()},${JSON.stringify(resources)}::jsonb,${input.participantCount || 1},${Boolean(input.athleteId)},'confirmed',${input.lessonSport || null},${input.lessonConfig ? JSON.stringify(input.lessonConfig) : null}::jsonb)`;
  if (delivery && delivery.revision > 0)
    await sql`insert into operational_booking_changes(booking_id,revision,starts_at,ends_at,status,reason,updated_by,source_kind,source_key) values(${id},1,${delivery.startsAt},${delivery.endsAt},${delivery.status},${delivery.reason},${delivery.updatedBy},'event-session',${delivery.sessionKey})`;
  for (const resource of cancelled ? [] : resources) {
    for (let ms = occupancyStart.getTime(); ms < occupancyEnd.getTime(); ms += 300_000) {
      const inserted =
        await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${resource},${new Date(ms).toISOString()},${id}) on conflict do nothing returning booking_id`;
      if (!inserted.length) {
        await sql.query("rollback to savepoint financial_paid_booking");
        await sql.query("release savepoint financial_paid_booking");
        return null;
      }
    }
  }
  if (input.athleteId)
    await sql`insert into booking_participants(booking_id,athlete_id) values(${id},${input.athleteId})`;
  await sql.query("release savepoint financial_paid_booking");
  return id;
}

export async function grantCredits(
  sql: Sql,
  input: {
    key: string;
    userId: string | null;
    athleteId: string | null;
    orderId: string;
    subscriptionId?: string;
    quote: Quote;
    start: Date;
    end: Date;
    initialBooking?: boolean;
  },
) {
  const q = input.quote;
  const grants =
    q.kind === "cage-plan"
      ? [{ kind: "cage-minutes", quantity: q.credits * 60, minutes: 1 }]
      : [
          {
            kind: "lesson",
            quantity: Math.max(
              0,
              q.credits -
                (input.initialBooking && (!q.assessment || q.initialBookingUsesCredit) ? 1 : 0),
            ),
            minutes: q.sessionMinutes,
          },
          { kind: "remote-review", quantity: q.remote, minutes: 20 },
          { kind: "film-review", quantity: q.filmReviews || 0, minutes: 0 },
        ];
  for (const grant of grants.filter((g) => g.quantity > 0)) {
    await sql`insert into credit_grants (id,user_id,athlete_id,order_id,subscription_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at)
      values (${randomUUID()},${input.userId},${input.athleteId},${input.orderId},${input.subscriptionId || null},
        ${`${input.key}:${grant.kind}`},${grant.kind},${grant.minutes},${grant.quantity},${grant.quantity},${input.start.toISOString()},${input.end.toISOString()})
      on conflict (source_key) do nothing`;
  }
}

export async function carryOneSession(
  sql: Sql,
  subscriptionId: string,
  start: Date,
  end: Date,
  kind = "lesson",
) {
  const [old] = await sql<{
    id: string;
    user_id: string | null;
    athlete_id: string;
    order_id: string;
    minutes: number;
    kind: string;
    payment_id: string | null;
  }>`
    select id,user_id,athlete_id,order_id,minutes,kind,payment_id from credit_grants where subscription_id = ${subscriptionId}
      and kind in ('lesson','remote-review','film-review') and rollover = false and remaining > 0 and expires_at = ${start.toISOString()}
    order by case when kind=${kind} then 0 else 1 end,expires_at desc,id limit 1 for update`;
  if (!old) return;
  const rows = await sql<{
    id: string;
  }>`insert into credit_grants (id,user_id,athlete_id,order_id,subscription_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at,rollover,payment_id)
    values (${randomUUID()},${old.user_id},${old.athlete_id},${old.order_id},${subscriptionId},${`roll:${subscriptionId}:${kind}:${start.toISOString()}`},
      ${old.kind},${old.minutes},1,1,${start.toISOString()},${end.toISOString()},true,${old.payment_id}) on conflict (source_key) do nothing returning id`;
  if (rows.length) {
    // Retain the original funding denominator; a one-credit rollover is not
    // worth an entire month's payment. Do not infer provenance for old rows.
    await sql`insert into commerce_policy(id,value,updated_by)
      values(${"credit-funding:" + rows[0].id},${JSON.stringify({ sourceGrantId: old.id })}::jsonb,${old.user_id || "system"}) on conflict(id) do nothing`;
    await sql`update credit_grants set remaining = remaining - 1 where id = ${old.id}`;
  }
}

/** Durable compensating refunds; the worker calls Square with each saved refund key. */
export async function queueExpiredCheckoutRefunds(sql: Sql, environment: string, orderId?: string) {
  const abandoned = await sql<{
    id: string;
    order_id: string;
    amount_cents: number;
    refunded_cents: number;
    user_id: string;
  }>`select p.id,p.order_id,p.amount_cents,p.refunded_cents,o.user_id from square_payments p join commerce_orders o on o.id=p.order_id where p.environment=${environment} and o.status in ('expired','payment_review') and (${orderId ?? null}::text is null or o.id=${orderId ?? null}) and p.refunded_cents<p.amount_cents limit 10`;
  for (const p of abandoned)
    await sql`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,reason,square_payment_id,request_key) values(${"expired:" + p.id},${p.order_id},${p.user_id},${p.amount_cents - p.refunded_cents},'pending','Checkout expired before complete payment; no confirmed booking',${p.id},${"expired:" + p.id}) on conflict do nothing`;
}
