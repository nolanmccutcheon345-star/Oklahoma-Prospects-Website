import type { Sql } from "../db";
import type { Quote } from "./contracts";
import { BREAK_THE_BAT_CODE } from "./break-the-bat";

type Customer = { userId: string; email: string; environment: string };

/** Caller supplies verified account identity, never checkout form identity. */
export async function assertBreakTheBatAvailable(
  sql: Sql,
  quote: Quote,
  customer: Customer,
  currentOrderId: string | null = null,
) {
  if (quote.discount?.code !== BREAK_THE_BAT_CODE) return;
  const [used] = await sql<{ exists: boolean }>`select exists(
    select 1 from commerce_orders o
    where o.snapshot->'discount'->>'code'=${BREAK_THE_BAT_CODE}
      and o.payment_environment=${customer.environment}
      and (o.user_id=${customer.userId} or lower(trim(o.email))=${customer.email.trim().toLowerCase()})
      and (${currentOrderId}::text is null or o.id<>${currentOrderId})
      and (o.square_payment_id is not null or exists(
        select 1 from square_payment_attempts a where a.order_id=o.id
        and a.status in ('pending','unknown','completed')
      ))
  )`;
  if (used.exists)
    throw new Error(
      "This offer is limited to one use per customer. You have already used it or have a payment awaiting confirmation. Check billing history before trying again.",
    );
}

/**
 * Run in the payment-attempt transaction, BEFORE inserting the durable pending
 * attempt. Locks plus a fresh SQL query serialize simultaneous checkouts.
 * Unknown payments continue blocking reuse until resolved; definite declines
 * release eligibility. A completed/refunded purchase never resets the offer.
 */
export async function lockBreakTheBatCustomer(
  sql: Sql,
  quote: Quote,
  customer: Customer,
  orderId: string,
) {
  if (quote.discount?.code !== BREAK_THE_BAT_CODE) return;
  const keys = ["user:" + customer.userId, "email:" + customer.email.trim().toLowerCase()].sort();
  for (const key of keys)
    await sql`select pg_advisory_xact_lock(hashtextextended(${BREAK_THE_BAT_CODE + ":" + customer.environment + ":" + key},0))`;
  await assertBreakTheBatAvailable(sql, quote, customer, orderId);
}
