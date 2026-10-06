import type { Sql } from "../db";

/** Use the immutable funded grant, never today's catalog or the membership's
 * initial order total. A setup payment is separate and cannot fund this refund.
 * Caller locks the parent order first; confirmation also locks the payment. */
export async function lessonRefundValue(
  sql: Sql,
  bookingId: string,
  orderId: string,
  householdId: string,
  lock = false,
) {
  const rows = await sql<{
    id: string;
    quantity: number;
    used: number;
    payment_id: string | null;
    kind: string;
    order_id: string;
    household_id: string | null;
    rollover: boolean;
    reversed_at: Date | null;
  }>`select g.id,g.quantity,u.quantity as used,g.payment_id,g.kind,g.order_id,g.household_id,g.rollover,u.reversed_at
    from credit_uses u join credit_grants g on g.id=u.grant_id where u.booking_id=${bookingId}`;
  if (rows.length !== 1) throw new Error("Lesson funding requires office review.");
  const g = rows[0];
  if (
    g.kind !== "lesson" ||
    g.order_id !== orderId ||
    g.household_id !== householdId ||
    g.reversed_at ||
    !g.payment_id ||
    !Number.isSafeInteger(g.quantity) ||
    g.quantity <= 0 ||
    !Number.isSafeInteger(g.used) ||
    g.used !== 1
  )
    throw new Error("Lesson funding requires office review.");
  let fundedQuantity = g.quantity;
  if (g.rollover) {
    const [provenance] = await sql<{
      value: { sourceGrantId: string };
    }>`select value from commerce_policy where id=${"credit-funding:" + g.id}`;
    const [source] = await sql<{
      quantity: number;
      payment_id: string | null;
      order_id: string;
      household_id: string | null;
      kind: string;
      rollover: boolean;
    }>`select quantity,payment_id,order_id,household_id,kind,rollover from credit_grants where id=${provenance?.value.sourceGrantId || ""}`;
    if (
      !source ||
      source.rollover ||
      source.kind !== "lesson" ||
      source.order_id !== orderId ||
      source.household_id !== householdId ||
      source.payment_id !== g.payment_id ||
      !Number.isSafeInteger(source.quantity) ||
      source.quantity <= 0
    )
      throw new Error("Lesson funding requires office review.");
    fundedQuantity = source.quantity;
  }
  type Payment = {
    id: string;
    amount_cents: number;
    refunded_cents: number;
    order_id: string;
    purpose: string;
    status: string;
    invoice_id: string | null;
  };
  const [p] = lock
    ? await sql<Payment>`select * from square_payments where id=${g.payment_id} for update`
    : await sql<Payment>`select * from square_payments where id=${g.payment_id}`;
  if (
    !p ||
    p.order_id !== orderId ||
    p.purpose !== "base" ||
    p.status !== "COMPLETED" ||
    !Number.isSafeInteger(p.amount_cents) ||
    p.amount_cents <= 0
  )
    throw new Error("Lesson funding requires office review.");
  // Split invoice payments need a funding allocation; do not refund another card.
  if (p.invoice_id) {
    const payments = await sql`select id from square_payments where invoice_id=${p.invoice_id}`;
    if (payments.length !== 1) throw new Error("Lesson funding requires office review.");
  }
  const [reserved] = await sql<{ completed: string; pending: string }>`select
    coalesce(sum(amount_cents) filter(where status='completed'),0) as completed,
    coalesce(sum(amount_cents) filter(where status not in ('completed','rejected')),0) as pending
    from commerce_refunds where square_payment_id=${p.id}`;
  const available =
    p.amount_cents -
    Math.max(p.refunded_cents, Number(reserved.completed)) -
    Number(reserved.pending);
  return {
    paymentId: p.id,
    paidCents: Math.round(p.amount_cents / fundedQuantity),
    // Round only once at the final refund, avoiding double rounding of odd cents.
    halfRefundCents: Math.round(p.amount_cents / (2 * fundedQuantity)),
    availableCents: Math.max(0, available),
  };
}
