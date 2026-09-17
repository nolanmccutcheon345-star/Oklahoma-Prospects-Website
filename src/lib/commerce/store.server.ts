import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { Quote } from "./contracts";

export async function expireHolds(sql: Sql, now = new Date()) {
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
    productId: string;
    start: Date;
    end: Date;
    resources: string[];
    participantCount?: number;
  },
) {
  if (input.start >= input.end || !input.resources.length)
    throw new Error("Invalid booking window.");
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
  const [paid] = await sql`select id from commerce_orders where id=${input.orderId} and status='paid' for update`;
  if (!paid) throw new Error("Successful payment is required before booking.");
  if (input.start >= input.end || input.start <= new Date() || !input.resources.length)
    return null;
  const id = randomUUID();
  const resources = [...new Set([...input.resources, ...(input.athleteId ? [`athlete:${input.athleteId}`] : [])])].sort();
  await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,participant_count,participants_verified,status)
    values(${id},${input.orderId},${input.userId},${input.athleteId},${input.coachId || null},${input.productId},${input.start.toISOString()},${input.end.toISOString()},${JSON.stringify(resources)}::jsonb,${input.participantCount || 1},${Boolean(input.athleteId)},'confirmed')`;
  for (const resource of resources) {
    for (let ms = input.start.getTime(); ms < input.end.getTime(); ms += 300_000) {
      const inserted = await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${resource},${new Date(ms).toISOString()},${id}) on conflict do nothing returning booking_id`;
      if (!inserted.length) {
        await sql`delete from booking_occupancy where booking_id=${id}`;
        await sql`delete from booking_records where id=${id}`;
        return null;
      }
    }
  }
  if (input.athleteId)
    await sql`insert into booking_participants(booking_id,athlete_id) values(${id},${input.athleteId})`;
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
            quantity: Math.max(0, q.credits - (input.initialBooking && !q.assessment ? 1 : 0)),
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
  }>`
    select id,user_id,athlete_id,order_id,minutes,kind from credit_grants where subscription_id = ${subscriptionId}
      and kind in ('lesson','remote-review','film-review') and rollover = false and remaining > 0 and expires_at = ${start.toISOString()}
    order by case when kind=${kind} then 0 else 1 end,expires_at desc,id limit 1 for update`;
  if (!old) return;
  const rows =
    await sql`insert into credit_grants (id,user_id,athlete_id,order_id,subscription_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at,rollover)
    values (${randomUUID()},${old.user_id},${old.athlete_id},${old.order_id},${subscriptionId},${`roll:${subscriptionId}:${kind}:${start.toISOString()}`},
      ${old.kind},${old.minutes},1,1,${start.toISOString()},${end.toISOString()},true) on conflict (source_key) do nothing returning id`;
  if (rows.length)
    await sql`update credit_grants set remaining = remaining - 1 where id = ${old.id}`;
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
