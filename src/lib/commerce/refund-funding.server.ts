import type { Sql } from "../db";

export type RefundRecord = { id: string; amount_cents: number; status: string };
export function summarizeRefunds<T extends RefundRecord>(refunds: T[]) {
  if (!refunds.length) throw new Error("Refund records are missing.");
  return {
    ...refunds[0],
    amount_cents: refunds.reduce((sum, r) => sum + r.amount_cents, 0),
    status: refunds.every((r) => r.status === "completed")
      ? "completed"
      : refunds.some((r) => ["failed", "rejected"].includes(r.status))
        ? "failed"
        : "pending",
    refunds,
  };
}

/** Refund each original payment. Caller locks the parent order before payment locks.
 * Cumulative rounding keeps the batch equal to the rounded order-level refund. */
export async function standaloneRefundFunding(
  sql: Sql,
  order: {
    id: string;
    kind: string;
    status: string;
    total_cents: number;
    payment_provider: string;
    square_payment_id: string | null;
    square_fee_payment_id: string | null;
    snapshot: { recurring: boolean };
  },
  fraction: number,
  lock = false,
) {
  if (![0, 0.5, 1].includes(fraction)) throw new Error("Invalid refund fraction.");
  if (fraction === 0) return [];
  if (
    order.status !== "paid" ||
    order.payment_provider !== "square" ||
    order.snapshot.recurring ||
    !["lesson", "cage"].includes(order.kind) ||
    !order.square_payment_id ||
    !Number.isSafeInteger(order.total_cents) ||
    order.total_cents <= 0
  )
    throw new Error("Original payment requires office review.");
  const ids = [
    order.square_payment_id,
    ...(order.square_fee_payment_id ? [order.square_fee_payment_id] : []),
  ];
  type Payment = {
    id: string;
    amount_cents: number;
    refunded_cents: number;
    purpose: string;
    status: string;
  };
  const payments = lock
    ? await sql<Payment>`select id,amount_cents,refunded_cents,purpose,status from square_payments where order_id=${order.id} and id=any(${ids}::text[]) order by id for update`
    : await sql<Payment>`select id,amount_cents,refunded_cents,purpose,status from square_payments where order_id=${order.id} and id=any(${ids}::text[]) order by id`;
  if (
    payments.length !== ids.length ||
    payments.reduce((sum, p) => sum + p.amount_cents, 0) !== order.total_cents
  )
    throw new Error("Original payment requires office review.");
  let cumulative = 0,
    allocated = 0;
  const funding: { paymentId: string; amount: number; setup: boolean }[] = [];
  for (const p of payments) {
    const setup = p.id === order.square_fee_payment_id;
    if (
      p.status !== "COMPLETED" ||
      p.purpose !== (setup ? "setup-fee" : "base") ||
      !Number.isSafeInteger(p.amount_cents) ||
      p.amount_cents <= 0 ||
      !Number.isSafeInteger(p.refunded_cents) ||
      p.refunded_cents < 0
    )
      throw new Error("Original payment requires office review.");
    cumulative += p.amount_cents;
    const amount = Math.round(cumulative * fraction) - allocated;
    allocated += amount;
    const [reserved] = await sql<{ completed: string; pending: string }>`select
      coalesce(sum(amount_cents) filter(where status='completed'),0) as completed,
      coalesce(sum(amount_cents) filter(where status not in ('completed','rejected')),0) as pending
      from commerce_refunds where square_payment_id=${p.id}`;
    if (
      amount >
      p.amount_cents -
        Math.max(p.refunded_cents, Number(reserved.completed)) -
        Number(reserved.pending)
    )
      throw new Error("Original payment requires office review.");
    if (amount) funding.push({ paymentId: p.id, amount, setup });
  }
  return funding;
}

/** Provider calls happen after commit. Each record retains its provider idempotency key. */
export async function settleRefundBatch(
  sql: Sql,
  refunds: RefundRecord[],
  execute: (id: string) => Promise<unknown>,
) {
  for (const refund of refunds)
    if (refund.amount_cents > 0 && refund.status !== "completed") await execute(refund.id);
  const states =
    await sql<RefundRecord>`select id,amount_cents,status from commerce_refunds where id=any(${refunds.map((r) => r.id)}::text[])`;
  if (states.length !== refunds.length) throw new Error("Refund confirmation is pending.");
  return summarizeRefunds(states);
}
