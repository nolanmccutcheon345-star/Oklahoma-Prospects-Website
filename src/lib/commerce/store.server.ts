import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { Quote } from "./contracts";
import { refundCents } from "../pricing";

/** Call inside a transaction. Cancelling the booking first prevents completion
 * while Stripe processes the refund; retries reuse the same durable intent. */
export async function prepareCancellation(sql: Sql, orderId: string, userId: string, now = new Date()) {
  const [order] = await sql<{id:string;status:string;total_cents:number;payment_intent_id:string|null;snapshot:Quote}>`
    select id,status,total_cents,payment_intent_id,snapshot from commerce_orders where id=${orderId} for update`;
  if (!order) throw new Error("Order not found.");
  const [existing] = await sql<{id:string;amount_cents:number;status:string}>`
    select id,amount_cents,status from commerce_refunds where order_id=${orderId}`;
  if (existing) return existing;
  if (order.status !== "paid") throw new Error("This order has no confirmed payment.");
  if (order.snapshot.recurring || order.snapshot.kind === "package") throw new Error("This purchase needs front-office review.");
  const bookings = await sql<{id:string;starts_at:Date;ends_at:Date;status:string}>`
    select id,starts_at,ends_at,status from booking_records where order_id=${orderId} order by starts_at for update`;
  const booking = bookings[0];
  if (bookings.length !== 1 || !booking || booking.status !== "confirmed" || new Date(booking.ends_at) <= now) {
    throw new Error("Only a future confirmed session can be cancelled online.");
  }
  const amount = refundCents(order.total_cents, new Date(booking.starts_at), now);
  if (amount > 0 && !order.payment_intent_id) throw new Error("Your payment needs front-office review before refunding.");
  const [refund] = await sql<{id:string;amount_cents:number;status:string}>`
    insert into commerce_refunds(id,order_id,booking_id,user_id,amount_cents,status,reason)
    values(${randomUUID()},${orderId},${booking.id},${userId},${amount},'pending','Family cancellation') returning id,amount_cents,status`;
  await sql`update commerce_orders set status='refunding',updated_at=now() where id=${orderId}`;
  await sql`update booking_records set status='cancelled' where id=${booking.id}`;
  await sql`delete from booking_occupancy where booking_id=${booking.id}`;
  return refund;
}

export async function expireHolds(sql: Sql, now = new Date()) {
  // Lock the same order rows used by fulfillment. Expiration must never release
  // occupancy underneath a webhook that has already committed payment.
  const expired = await sql<{id:string}>`select id from commerce_orders
    where status in ('pending','failed') and hold_until <= ${now.toISOString()}
    for update skip locked`;
  const ids = expired.map(row => row.id);
  if (!ids.length) return;
  await sql`delete from booking_occupancy where booking_id in (
    select id from booking_records where status = 'held' and order_id = any(${ids}::text[]))`;
  await sql`update booking_records set status = 'expired' where status = 'held' and order_id = any(${ids}::text[])`;
  await sql`update commerce_orders set status = 'expired',updated_at=now() where id = any(${ids}::text[])`;

}

export async function holdWindow(sql: Sql, input: {
  orderId: string | null; userId: string | null; athleteId: string | null; coachId?: string;
  productId: string; start: Date; end: Date; resources: string[]; participantCount?:number;
}) {
  if (input.start >= input.end || !input.resources.length) throw new Error("Invalid reservation window.");
  const id = randomUUID();
  const resources=[...new Set([...input.resources,...(input.athleteId?[`athlete:${input.athleteId}`]:[])])];
  await sql`insert into booking_records (id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,participant_count,participants_verified)
    values (${id},${input.orderId},${input.userId},${input.athleteId},${input.coachId || null},${input.productId},
      ${input.start.toISOString()},${input.end.toISOString()},${JSON.stringify(resources)}::jsonb,${input.participantCount||1},${Boolean(input.athleteId)})`;
  if(input.athleteId)await sql`insert into booking_participants(booking_id,athlete_id) values(${id},${input.athleteId})`;
  for (const resource of resources.sort()) {
    for (let ms = input.start.getTime(); ms < input.end.getTime(); ms += 300_000) {
      await sql`insert into booking_occupancy (resource_id,slot_at,booking_id) values (${resource},${new Date(ms).toISOString()},${id})`;
    }
  }
  return id;
}

export async function grantCredits(sql: Sql, input: {
  key: string; userId: string | null; athleteId: string | null; orderId: string;
  subscriptionId?: string; quote: Quote; start: Date; end: Date; initialBooking?: boolean;
}) {
  const q = input.quote;
  const grants = q.kind === "cage-plan" ? [{ kind: "cage-minutes", quantity: q.credits * 60, minutes: 1 }]
    : [{ kind: "lesson", quantity: Math.max(0, q.credits - (input.initialBooking ? 1 : 0)), minutes: q.sessionMinutes },
      { kind: "remote-review", quantity: q.remote, minutes: 20 }];
  for (const grant of grants.filter(g => g.quantity > 0)) {
    await sql`insert into credit_grants (id,user_id,athlete_id,order_id,subscription_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at)
      values (${randomUUID()},${input.userId},${input.athleteId},${input.orderId},${input.subscriptionId || null},
        ${`${input.key}:${grant.kind}`},${grant.kind},${grant.minutes},${grant.quantity},${grant.quantity},${input.start.toISOString()},${input.end.toISOString()})
      on conflict (source_key) do nothing`;
  }
}

export async function carryOneSession(sql: Sql, subscriptionId: string, start: Date, end: Date) {
  const [old] = await sql<{ id: string; user_id: string | null; athlete_id: string; order_id: string; minutes: number }>`
    select id,user_id,athlete_id,order_id,minutes from credit_grants where subscription_id = ${subscriptionId}
      and kind = 'lesson' and rollover = false and remaining > 0 and expires_at = ${start.toISOString()}
    order by expires_at desc limit 1 for update`;
  if (!old) return;
  const rows = await sql`insert into credit_grants (id,user_id,athlete_id,order_id,subscription_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at,rollover)
    values (${randomUUID()},${old.user_id},${old.athlete_id},${old.order_id},${subscriptionId},${`roll:${subscriptionId}:${start.toISOString()}`},
      'lesson',${old.minutes},1,1,${start.toISOString()},${end.toISOString()},true) on conflict (source_key) do nothing returning id`;
  if (rows.length) await sql`update credit_grants set remaining = remaining - 1 where id = ${old.id}`;
}
