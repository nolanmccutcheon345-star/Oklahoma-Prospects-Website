import type { Square } from "square";
import type { Sql } from "../db";

export function paymentRefundedCents(payment: Square.Payment, amountCents: number) {
  const money = payment.refundedMoney;
  const cents = Number(money?.amount ?? 0);
  if (
    (money && (money.currency !== "USD" || money.amount == null)) ||
    !Number.isSafeInteger(cents) ||
    cents < 0 ||
    cents > amountCents
  )
    throw new Error("Refund balance verification failed.");
  return cents;
}

/** Transaction-only: order first, then payment, matching initial fulfillment. */
export async function applySquareRefundBalance(
  sql: Sql,
  payment: Square.Payment,
  config: { environment: string; locationId: string },
) {
  const [reference] = await sql<{
    order_id: string;
  }>`select order_id from square_payments where id=${payment.id || ""}`;
  if (!reference) return false;
  const [order] = await sql<{
    square_customer_id: string;
    square_payment_id: string;
    payment_environment: string;
  }>`select square_customer_id,square_payment_id,payment_environment from commerce_orders where id=${reference.order_id} for update`;
  const [local] = await sql<{
    amount_cents: number;
    refunded_cents: number;
    environment: string;
  }>`select amount_cents,refunded_cents,environment from square_payments where id=${payment.id!} for update`;
  if (
    !order ||
    !local ||
    local.environment !== config.environment ||
    order.payment_environment !== config.environment ||
    payment.locationId !== config.locationId ||
    payment.customerId !== order.square_customer_id ||
    payment.amountMoney?.currency !== "USD" ||
    payment.amountMoney.amount !== BigInt(local.amount_cents) ||
    payment.totalMoney?.currency !== "USD" ||
    payment.totalMoney.amount !== BigInt(local.amount_cents)
  )
    throw new Error("Refund payment identity mismatch.");
  // Provider responses may arrive out of order; refunded money must never decrease.
  const refunded = Math.max(
    local.refunded_cents,
    paymentRefundedCents(payment, local.amount_cents),
  );
  await sql`update square_payments set refunded_cents=${refunded} where id=${payment.id!}`;
  if (refunded === local.amount_cents) {
    // An external full refund can finish a compensating refund before our worker.
    // The provider balance proves there is no money left to return; do not submit again.
    await sql`update commerce_refunds set status='completed' where square_payment_id=${payment.id!}
      and request_key=${"expired:" + payment.id!} and square_refund_id is null
      and status in ('pending','unknown')`;
    const grants = await sql<{
      id: string;
    }>`select id from credit_grants where payment_id=${payment.id!} for update`;
    const ids = grants.map((g) => g.id);
    await sql`update credit_grants set remaining=0 where id=any(${ids}::text[])`;
    const cancelled = await sql<{ id: string }>`update booking_records set status='cancelled'
      where status in ('held','confirmed') and
      (id in(select booking_id from credit_uses where grant_id=any(${ids}::text[])) or
      (order_id=${reference.order_id} and ${payment.id === order.square_payment_id} and
      not exists(select 1 from credit_uses u where u.booking_id=booking_records.id))) returning id`;
    await sql`delete from booking_occupancy where booking_id=any(${cancelled.map((b) => b.id)}::text[])`;
    await sql`update commerce_orders set status='refunded',subscription_setup_status=null,updated_at=now()
      where id=${reference.order_id} and not coalesce((snapshot->>'recurring')::boolean,false)`;
    await sql`update payment_notifications set status='resolved' where order_id=${reference.order_id}
      and status='pending' and kind in ('receipt','owner-booking')`;
  }
  return true;
}
