import { getSql } from "../db";
import { commerceIdentity as clubIdentity } from "./access.server";
import { squareClient, squareConfig, squareKey } from "./square.server";
import { assertPaymentRequest } from "./square-payments.server";
import { rateLimit } from "./checkout.server";
import { syncSquareSubscription, syncSquareRefund } from "./square-webhook.server";
import { parentCancellationRefund, householdChangeAvailable } from "./booking-change-policy.server";
import { lessonRefundValue } from "./lesson-refund-value.server";
import { standaloneRefundFunding, settleRefundBatch } from "./refund-funding.server";
import { saveParentBookingCancellation } from "./family-cancellation.server";

export async function ownedSubscription(userId: string, id: string, ownerOnly = false) {
  const me = await clubIdentity(userId),
    sql = await getSql();
  const [sub] = await sql<{
    id: string;
    customer_id: string;
    user_id: string;
    period_end: Date;
    scheduled_action: string | null;
    status: string;
    payment_provider: string;
  }>`select * from club_subscriptions where id=${id} and (${me.role === "admin"} or household_id=any(${me.billingHouseholdIds}::text[]))`;
  if (!sub || (ownerOnly && sub.user_id !== userId && me.role !== "admin"))
    throw new Error("Membership not found.");
  if (sub.payment_provider !== "square")
    throw new Error("This historical membership requires front-office review.");
  return { sub, me, sql };
}
export async function changeRenewal(
  userId: string,
  id: string,
  action: "cancel" | "pause" | "resume",
  cycles?: number,
) {
  assertPaymentRequest();
  await rateLimit("square-management", 20);
  const { me } = await ownedSubscription(userId, id);
  if (action === "pause" && me.role !== "admin")
    throw new Error("The office must approve the pause length before billing changes.");
  const client = squareClient();
  await syncSquareSubscription(id);
  const { sub } = await ownedSubscription(userId, id);
  if (action === "cancel") await client.subscriptions.cancel({ subscriptionId: id });
  if (action === "pause") {
    if (!cycles || !Number.isInteger(cycles) || cycles < 1 || cycles > 12)
      throw new Error("Choose one to twelve billing cycles for the approved pause.");
    await client.subscriptions.pause({ subscriptionId: id, pauseCycleDuration: BigInt(cycles) });
  }
  if (action === "resume") {
    if (sub.status !== "paused") throw new Error("Only a paused membership can resume.");
    await client.subscriptions.resume({
      subscriptionId: id,
      resumeChangeTiming: "END_OF_BILLING_CYCLE",
    });
  }
  await syncSquareSubscription(id);
  return { ok: true };
}
export async function updateSquareCard(
  userId: string,
  input: {
    id: string;
    sourceId: string;
    requestId: string;
    purpose?: "primary" | "backup";
    consent?: true;
  },
) {
  assertPaymentRequest();
  if (input.purpose === "backup" && !input.consent)
    throw new Error("Authorize saving the backup card first.");
  await rateLimit("square-card-update", 10);
  const { sub, sql } = await ownedSubscription(userId, input.id, true),
    client = squareClient();
  const { card } = await client.cards.create({
    idempotencyKey: squareKey("update-card", `${userId}:${input.requestId}`),
    sourceId: input.sourceId,
    card: { customerId: sub.customer_id },
  });
  if (!card?.id || card.customerId !== sub.customer_id || card.enabled === false)
    throw new Error("Card update could not be confirmed.");
  const { subscription: current } = await client.subscriptions.get({ subscriptionId: sub.id });
  if (
    !current ||
    current.customerId !== sub.customer_id ||
    current.locationId !== squareConfig().locationId
  )
    throw new Error("Membership verification failed.");
  if (input.purpose === "backup") {
    const display = JSON.stringify({ brand: card.cardBrand || "Card", last4: card.last4 || "" });
    await sql.transaction(async (tx) => {
      await tx`select set_config('app.actor_id',${userId},true)`;
      await tx`insert into customer_payment_preferences(subscription_id,backup_card_id,backup_display,authorized_by,authorized_at,consent_text) values(${sub.id},${card.id},${display}::jsonb,${userId},now(),'Save a backup card with Square; activation requires a separate customer action.') on conflict(subscription_id) do update set backup_card_id=excluded.backup_card_id,backup_display=excluded.backup_display,authorized_by=excluded.authorized_by,authorized_at=now(),consent_text=excluded.consent_text,updated_at=now()`;
    });
    return { ok: true };
  }
  await client.subscriptions.update({
    subscriptionId: sub.id,
    subscription: { version: current.version, cardId: card.id },
  });
  await sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    await tx`update commerce_orders set square_card_id=${card.id} where subscription_id=${sub.id}`;
    await tx`insert into customer_payment_preferences(subscription_id,primary_card_id,primary_display,authorized_by,authorized_at,consent_text) values(${sub.id},${card.id},${JSON.stringify({ brand: card.cardBrand || "Card", last4: card.last4 || "" })}::jsonb,${userId},now(),'Customer updated their primary renewal payment method') on conflict(subscription_id) do update set primary_card_id=excluded.primary_card_id,primary_display=excluded.primary_display,authorized_by=excluded.authorized_by,authorized_at=now(),consent_text=excluded.consent_text,updated_at=now()`;
  });
  await syncSquareSubscription(sub.id);
  return { ok: true };
}
async function cancellationContext(userId: string, bookingId: string) {
  const me = await clubIdentity(userId),
    sql = await getSql();
  if (me.role === "player") throw new Error("A parent account is required to manage bookings.");
  const [b] = await sql<{
    id: string;
    order_id: string;
    household_id: string | null;
    starts_at: Date;
    ends_at: Date;
    status: string;
  }>`select * from booking_records where id=${bookingId} and (household_id=any(${me.billingHouseholdIds}::text[]) or ${me.role === "admin"})`;
  if (!b) throw new Error("Booking not found.");
  const [order] = await sql<{
    id: string;
    total_cents: number;
    square_payment_id: string;
    payment_provider: string;
    kind: string;
    status: string;
    square_fee_payment_id: string | null;
    snapshot: { recurring: boolean };
  }>`select * from commerce_orders where id=${b.order_id}`;
  const uses = await sql<{
    id: string;
    quantity: number;
    reversed_at: Date | null;
  }>`select id,quantity,reversed_at from credit_uses where booking_id=${b.id}`;
  const now = new Date();
  const allowanceAvailable =
    Boolean(b.household_id) &&
    (await householdChangeAvailable(sql, b.household_id!, "booking:" + b.id, now));
  const fraction =
    parentCancellationRefund(100, new Date(b.starts_at), allowanceAvailable, now) / 100;
  const existing = await sql<{
    amount_cents: number;
  }>`select amount_cents from commerce_refunds where request_key=${"booking:" + b.id} or request_key=${"booking:" + b.id + ":setup"}`;
  const isCredit = uses.length > 0;
  let lessonValue: Awaited<ReturnType<typeof lessonRefundValue>> | undefined;
  let review =
    !b.household_id ||
    (!isCredit &&
      (!order.square_payment_id ||
        !["lesson", "cage"].includes(order.kind) ||
        order.snapshot.recurring));
  if (isCredit && fraction === 0.5 && !existing.length) {
    try {
      lessonValue = await lessonRefundValue(sql, b.id, order.id, b.household_id!);
      review =
        order.payment_provider !== "square" ||
        lessonValue.halfRefundCents > lessonValue.availableCents;
    } catch {
      review = true;
    }
  }
  if (!isCredit && fraction > 0 && !existing.length && !review) {
    try {
      await standaloneRefundFunding(sql, order, fraction);
    } catch {
      review = true;
    }
  }
  return {
    sql,
    me,
    b,
    order,
    uses,
    isCredit,
    review,
    allowanceAvailable,
    paidCents: isCredit ? (lessonValue?.paidCents ?? null) : order.total_cents,
    amount:
      (existing.length ? existing.reduce((sum, r) => sum + r.amount_cents, 0) : undefined) ??
      (isCredit
        ? (lessonValue?.halfRefundCents ?? 0)
        : parentCancellationRefund(
            order.total_cents,
            new Date(b.starts_at),
            allowanceAvailable,
            now,
          )),
    restore: isCredit && fraction === 1,
  };
}
export async function squareRefundPreview(userId: string, bookingId: string) {
  const c = await cancellationContext(userId, bookingId);
  if (c.b.status === "completed" || new Date(c.b.starts_at).getTime() <= Date.now())
    throw new Error("Completed or past bookings require office review.");
  return {
    orderId: c.b.id,
    paidCents: c.paidCents,
    refundCents: c.review ? null : c.amount,
    requiresReview: c.review,
    credit: c.isCredit,
    restoresCredit: c.restore,
    householdAllowanceAvailable: c.allowanceAvailable,
    allowanceResets: "First of each month in America/Chicago",
  };
}
export async function cancelSquareBooking(userId: string, bookingId: string) {
  assertPaymentRequest();
  await rateLimit("square-refund", 15);
  const c = await cancellationContext(userId, bookingId);
  if (c.review) {
    await c.sql`insert into club_requests(id,user_id,kind,payload) values(${"refund-review:" + c.b.id},${userId},'refund-review',${JSON.stringify({ bookingId: c.b.id, orderId: c.order.id, reason: c.isCredit ? "Original lesson funding requires review." : "Historical processor review." })}::jsonb) on conflict do nothing`;
    return { status: "review_requested", refundCents: null };
  }
  const refund = await saveParentBookingCancellation(c.sql, c.b.id, c.order.id, userId, c.me);
  const confirmed = await settleRefundBatch(c.sql, refund.refunds, executeSquareRefund);
  return { status: confirmed.status, refundCents: refund.amount_cents };
}
export async function executeSquareRefund(id: string) {
  const sql = await getSql(),
    client = squareClient();
  const [r] = await sql<{
    id: string;
    square_payment_id: string;
    amount_cents: number;
    reason: string;
    status: string;
    square_refund_id: string | null;
  }>`select * from commerce_refunds where id=${id}`;
  if (!r || r.status === "completed" || r.status.startsWith("external_")) return;
  if (r.square_refund_id) {
    await syncSquareRefund(r.square_refund_id);
    return;
  }
  const [funding] = await sql<{
    amount_cents: number;
    refunded_cents: number;
    external: string;
  }>`select p.amount_cents,p.refunded_cents,
    coalesce((select sum(amount_cents) from commerce_refunds where square_payment_id=p.id and external_status is not null),0) as external
    from square_payments p where p.id=${r.square_payment_id}`;
  if (
    !funding ||
    r.amount_cents > funding.amount_cents - funding.refunded_cents - Number(funding.external)
  )
    throw new Error(
      "Refund funding is already returned or reserved for external reimbursement. Review in Finance.",
    );
  const { refund } = await client.refunds.refundPayment({
    idempotencyKey: squareKey("refund", r.id),
    paymentId: r.square_payment_id,
    amountMoney: { amount: BigInt(r.amount_cents), currency: "USD" },
    reason: r.reason.slice(0, 192),
  });
  if (!refund?.id)
    throw new Error("Refund confirmation pending. The cancelled booking remains cancelled.");
  await sql`update commerce_refunds set square_refund_id=${refund.id},status=${refund.status?.toLowerCase() || "pending"} where id=${id}`;
  await syncSquareRefund(refund.id);
}
