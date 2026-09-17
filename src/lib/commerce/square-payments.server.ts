import { createHash } from "node:crypto";
import type { Square } from "square";
import { getSql, type Sql } from "../db";
import { getSessionUser } from "../auth/verify.server";
import { clubIdentity } from "../identity.server";
import { getRequest } from "@tanstack/react-start/server";
import { assertSameSiteRequest } from "../auth/isolation.server";
import {
  squareConfig,
  squareClient,
  squareKey,
  planVariation,
  safePaymentError,
} from "./square.server";
import { rateLimit } from "./checkout.server";
import { grantCredits, createPaidBooking, queueExpiredCheckoutRefunds } from "./store.server";
import { addCalendarMonth } from "./catalog";
import { chicagoDate, chicagoInstant } from "../scheduling";
import type { Quote } from "./contracts";
export type SquareOrder = {
  id: string;
  user_id: string;
  email: string;
  athlete_id: string | null;
  snapshot: Quote & { bookingWindow?: { start: string; end: string; coachId?: string; participantCount: number } | null };
  status: string;
  total_cents: number;
  hold_until: Date;
  paid_at: Date | null;
  payment_environment: string;
  square_customer_id: string | null;
  square_payment_id: string | null;
  square_fee_payment_id: string | null;
  subscription_id: string | null;
  square_card_id: string | null;
};
export function assertPaymentRequest() {
  assertSameSiteRequest();
  const req = getRequest();
  if (!req || req.method !== "POST") throw new Error("Payment changes require POST.");
  const origin = req.headers.get("origin");
  if (!origin || origin !== squareConfig().origin)
    throw new Error("Payment request origin is not allowed.");
}
export async function validateSquarePlan(id: string, cents: number, client = squareClient()) {
  const { object } = await client.catalog.object.get({ objectId: id });
  const variation =
    object?.type === "SUBSCRIPTION_PLAN_VARIATION"
      ? object.subscriptionPlanVariationData
      : undefined;
  const phase = variation?.phases?.[0];
  if (
    object?.isDeleted ||
    !variation ||
    variation.phases?.length !== 1 ||
    phase?.cadence !== "MONTHLY" ||
    phase.periods ||
    phase.pricing?.type !== "STATIC" ||
    phase.pricing.priceMoney?.currency !== "USD" ||
    phase.pricing.priceMoney.amount !== BigInt(cents)
  )
    throw new Error(
      "The Square plan does not match the approved monthly price. Enrollment is unavailable.",
    );
}
export function nextBillingDate(paidAt: Date) {
  return chicagoDate(addCalendarMonth(chicagoInstant(chicagoDate(paidAt), "12:00")));
}
export function verifiedPayment(
  payment: Square.Payment,
  order: SquareOrder,
  locationId: string,
  expectedCents = order.total_cents,
) {
  if (
    !payment.id ||
    payment.referenceId !== order.id ||
    payment.locationId !== locationId ||
    payment.customerId !== order.square_customer_id ||
    payment.amountMoney?.currency !== "USD" ||
    payment.amountMoney.amount !== BigInt(expectedCents) ||
    payment.totalMoney?.amount !== BigInt(expectedCents) ||
    payment.sourceType !== "CARD"
  )
    throw new Error("Payment verification failed.");
  return payment.status === "COMPLETED";
}
/** Run inside a transaction; payment events and the synchronous response share this path. */
export async function fulfillSquarePayment(
  sql: Sql,
  payment: Square.Payment,
  config: { environment: string; locationId: string },
) {
  if (!payment.referenceId) return;
  const [order] =
    await sql<SquareOrder>`select * from commerce_orders where id=${payment.referenceId} and payment_provider='square' for update`;
  if (!order) return;
  if (order.payment_environment !== config.environment)
    throw new Error("Payment environment mismatch.");
  const fee =
    order.snapshot.setupCents > 0 &&
    payment.amountMoney?.amount === BigInt(order.snapshot.setupCents);
  const expected = fee
    ? order.snapshot.setupCents
    : order.snapshot.setupCents > 0
      ? order.snapshot.regularCents
      : order.total_cents;
  if (!verifiedPayment(payment, order, config.locationId, expected)) return;
  const id = payment.id!,
    prior = fee ? order.square_fee_payment_id : order.square_payment_id;
  if (prior && prior !== id)
    throw new Error("Order already has a different payment for this charge.");
  if (prior === id) return;
  if (fee && !order.square_payment_id)
    throw new Error("First-month payment must be verified before the separate fee.");
  const paidAt = new Date(order.paid_at || payment.createdAt || new Date());
  const end = order.snapshot.recurring
    ? chicagoInstant(nextBillingDate(paidAt), "00:00")
    : new Date(paidAt.getTime() + order.snapshot.expiresDays * 86400000);
  await sql`insert into square_payments(id,order_id,environment,amount_cents,status,receipt_url,period_start,period_end,purpose)
    values(${id},${order.id},${config.environment},${expected},'COMPLETED',${payment.receiptUrl || null},${paidAt.toISOString()},${end.toISOString()},${fee ? "setup-fee" : "base"}) on conflict(id) do nothing`;
  await sql`update square_payment_attempts set status='completed',payment_id=${id} where order_id=${order.id} and status in ('pending','unknown')`;
  if (fee) await sql`update commerce_orders set square_fee_payment_id=${id} where id=${order.id}`;
  else
    await sql`update commerce_orders set square_payment_id=${id},paid_at=${paidAt.toISOString()},receipt_url=${payment.receiptUrl || null} where id=${order.id}`;
  const needsFee = order.snapshot.setupCents > 0 && !fee && !order.square_fee_payment_id;
  if (needsFee && order.status === "pending" && new Date(order.hold_until).getTime() > Date.now()) {
    await sql`update commerce_orders set status='pending_fee',updated_at=now() where id=${order.id}`;
    return;
  }
  const bookings = await sql<{
    id: string;
    status: string;
    starts_at: Date;
  }>`select id,status,starts_at from booking_records where order_id=${order.id} for update`;
  let late =
    bookings.some((b) => b.status !== "held" || new Date(b.starts_at).getTime() <= Date.now()) ||
    (bookings.length > 0 && new Date(order.hold_until).getTime() <= Date.now());
  const window = order.snapshot.bookingWindow;
  if (window) late ||= new Date(window.start).getTime() <= Date.now() || new Date(order.hold_until).getTime() <= Date.now();
  // Expired/partially-paid sessions must not activate a membership or book a time.
  late ||= !["pending", "pending_fee"].includes(order.status) || needsFee;
  await sql`update commerce_orders set status=${late ? "payment_review" : "paid"},paid_at=${paidAt.toISOString()},subscription_setup_status=${order.snapshot.recurring && !late ? "pending" : null},updated_at=now() where id=${order.id}`;
  if (!late && window) {
    const bookingId = await createPaidBooking(sql, {
      orderId: order.id, userId: order.user_id, athleteId: order.athlete_id,
      coachId: window.coachId,
      productId: order.snapshot.setupCents > 0 ? (order.snapshot.discipline === "Hitting" ? "s9" : "s1") : order.snapshot.productId,
      start: new Date(window.start), end: new Date(window.end),
      resources: order.snapshot.resources, participantCount: window.participantCount,
    });
    if (bookingId) bookings.push({ id: bookingId, status: "confirmed", starts_at: new Date(window.start) });
    else {
      late = true;
      await sql`update commerce_orders set status='payment_review',subscription_setup_status=null where id=${order.id}`;
    }
  }
  if (late) {
    await sql`update booking_records set status='expired' where order_id=${order.id} and status='held'`;
    await sql`delete from booking_occupancy where booking_id in(select id from booking_records where order_id=${order.id} and status='expired')`;
    await sql`insert into club_requests(id,user_id,kind,payload) values(${"late-payment:" + id},${order.user_id},'payment-review',${JSON.stringify({ orderId: order.id, paymentId: id, reason: "Payment completed after checkout expired or the selected time became unavailable; no booking confirmed." })}::jsonb) on conflict do nothing`;
    await queueExpiredCheckoutRefunds(sql, config.environment, order.id);
    return;
  }
  await sql`update booking_records set status='confirmed' where order_id=${order.id} and status='held'`;
  if (order.snapshot.kind === "package" || order.snapshot.recurring) {
    await grantCredits(sql, {
      key: "square:" + (order.square_payment_id || id),
      userId: order.user_id,
      athleteId: order.athlete_id,
      orderId: order.id,
      quote: order.snapshot,
      start: paidAt,
      end,
      initialBooking: false,
    });
    if (bookings.length && !order.snapshot.assessment) {
      const [grant] = await sql<{
        id: string;
      }>`update credit_grants set remaining=remaining-1 where source_key=${"square:" + (order.square_payment_id || id) + ":lesson"} and remaining>0 returning id`;
      if (grant)
        await sql`insert into credit_uses(id,grant_id,booking_id,quantity) values(${"initial:" + id},${grant.id},${bookings[0].id},1) on conflict do nothing`;
    }
    await sql`update credit_grants set payment_id=${order.square_payment_id || id} where order_id=${order.id} and source_key like ${"square:" + (order.square_payment_id || id) + ":%"}`;
  }
  await sql`insert into payment_notifications(id,order_id,kind) values(${"receipt:" + id},${order.id},'receipt') on conflict do nothing`;
}
export async function provisionSubscription(orderId: string, client = squareClient()) {
  const sql = await getSql(),
    c = squareConfig();
  const [o] =
    await sql<SquareOrder>`select * from commerce_orders where id=${orderId} and status='paid' and payment_provider='square'`;
  if (!o || !o.snapshot.recurring || !o.square_payment_id || o.subscription_id) return;
  if (o.payment_environment !== c.environment)
    throw new Error("Subscription environment mismatch.");
  if (nextBillingDate(new Date(o.paid_at!)) <= chicagoDate())
    throw new Error("Delayed recurring setup requires owner review before any new charge.");
  const planId = planVariation(o.snapshot.productId);
  await validateSquarePlan(planId, o.snapshot.regularCents, client);
  // CreateCard accepts the completed payment id; a consumed nonce is never reused.
  const { card } = await client.cards.create({
    idempotencyKey: squareKey("card", o.id),
    sourceId: o.square_payment_id,
    card: { customerId: o.square_customer_id!, referenceId: o.id },
  });
  if (!card?.id) throw new Error("Saved payment method is pending.");
  const { subscription: s } = await client.subscriptions.create({
    idempotencyKey: squareKey("subscription", o.id),
    locationId: c.locationId,
    customerId: o.square_customer_id!,
    planVariationId: planId,
    cardId: card.id,
    startDate: nextBillingDate(new Date(o.paid_at!)),
    timezone: "America/Chicago",
    source: { name: "Oklahoma Prospects" },
  });
  if (!s?.id || s.customerId !== o.square_customer_id || s.locationId !== c.locationId)
    throw new Error("Subscription verification is pending.");
  await sql.transaction(async (tx) => {
    const end = chicagoInstant(nextBillingDate(new Date(o.paid_at!)), "00:00");
    await tx`insert into club_subscriptions(id,order_id,user_id,athlete_id,product_id,customer_id,status,amount_cents,period_start,period_end,payment_provider,provider_version)
      values(${s.id!},${o.id},${o.user_id},${o.athlete_id},${o.snapshot.productId},${o.square_customer_id!},${s.status?.toLowerCase() || "pending"},${o.snapshot.regularCents},${new Date(o.paid_at!).toISOString()},${end.toISOString()},'square',${s.version?.toString() || null}) on conflict(id) do nothing`;
    await tx`update commerce_orders set subscription_id=${s.id!},square_card_id=${card.id!},subscription_setup_status='complete',updated_at=now() where id=${o.id}`;
    await tx`update credit_grants set subscription_id=${s.id!} where order_id=${o.id} and subscription_id is null`;
  });
}
export async function paySquareOrder(
  input: {
    orderId: string;
    sourceId: string;
    attemptId: string;
  },
  verifiedUserId?: string,
) {
  assertPaymentRequest();
  await rateLimit("square-payment", 15);
  const session = verifiedUserId ? { id: verifiedUserId } : await getSessionUser();
  if (!session) throw new Error("Sign in before payment.");
  const identity = await clubIdentity(session.id);
  const sql = await getSql(),
    c = squareConfig(),
    client = squareClient();
  const [order] =
    await sql<SquareOrder>`select * from commerce_orders where id=${input.orderId} and user_id=${session.id} and payment_provider='square'`;
  if (!order || order.payment_environment !== c.environment) throw new Error("Checkout not found.");
  const url = `/paid?order_id=${order.id}`;
  const [priorAttempt] = await sql<{
    status: string;
  }>`select status from square_payment_attempts where id=${input.attemptId} and order_id=${order.id}`;
  if (
    priorAttempt?.status === "completed" ||
    order.status === "paid" ||
    order.status === "payment_review"
  )
    return { url, declined: false, message: "" };
  if (
    !["pending", "pending_fee"].includes(order.status) ||
    new Date(order.hold_until).getTime() <= Date.now()
  )
    throw new Error("This checkout expired. Check billing history before starting again.");
  const chargeCents =
    order.snapshot.setupCents > 0
      ? order.square_payment_id
        ? order.snapshot.setupCents
        : order.snapshot.regularCents
      : order.total_cents;
  if (order.snapshot.recurring)
    await validateSquarePlan(
      planVariation(order.snapshot.productId),
      order.snapshot.regularCents,
      client,
    );
  const { location } = await client.locations.get({ locationId: c.locationId });
  if (
    location?.merchantId !== c.merchantId ||
    location.currency !== "USD" ||
    location.status !== "ACTIVE" ||
    location.timezone !== "America/Chicago" ||
    !location.capabilities?.includes("CREDIT_CARD_PROCESSING")
  )
    throw new Error("The Square location is not ready to accept card payments.");
  const [previousCustomer] = await sql<{
    square_customer_id: string;
  }>`select square_customer_id from commerce_orders where user_id=${session.id} and payment_environment=${c.environment} and payment_provider='square' and square_customer_id is not null order by created_at limit 1`;
  const customerId = order.square_customer_id || previousCustomer?.square_customer_id;
  const { customer } = customerId
    ? await client.customers.get({ customerId })
    : await client.customers.create({
        idempotencyKey: squareKey("customer", `${c.environment}:${order.id}`),
        emailAddress: order.email,
        referenceId: session.id,
      });
  if (!customer?.id || customer.referenceId !== session.id)
    throw new Error("Payment account could not be verified.");
  const hash = createHash("sha256").update(input.sourceId).digest("hex");
  await sql.transaction(async (tx) => {
    const [current] =
      await tx<SquareOrder>`select * from commerce_orders where id=${order.id} for update`;
    if (
      !["pending", "pending_fee"].includes(current.status) ||
      new Date(current.hold_until).getTime() <= Date.now()
    )
      throw new Error("This checkout expired. Check billing history before starting again.");
    if (current.athlete_id) {
      const [athlete] = await tx<{
        assessed: boolean;
      }>`select exists(select 1 from athlete_assessments a where a.athlete_id=c.id) as assessed from club_athletes c where c.id=${current.athlete_id} and c.household_id=any(${identity.billingHouseholdIds}::text[])`;
      if (!athlete) throw new Error("This athlete is no longer linked to your billing household.");
      if (
        ["lesson", "package"].includes(current.snapshot.kind) &&
        !current.snapshot.assessment &&
        !athlete.assessed
      )
        throw new Error(
          "A completed assessment must remain on the athlete account before payment.",
        );
    }
    if (current.snapshot.bookingWindow) {
      const window = current.snapshot.bookingWindow;
      if (new Date(window.start).getTime() <= Date.now())
        throw new Error("This booking time has passed. No payment was submitted.");
      const occupied = await tx`select b.booking_id from booking_occupancy b join booking_records r on r.id=b.booking_id where r.status in ('confirmed','completed') and b.resource_id=any(${current.snapshot.resources}::text[]) and b.slot_at>=${window.start} and b.slot_at<${window.end} limit 1`;
      if (occupied.length) throw new Error("That time was just booked. Choose another time. No payment was submitted.");
    }
    const started =
      await tx`select id from booking_records where order_id=${order.id} and (status<>'held' or starts_at<=now())`;
    if (started.length)
      throw new Error("This booking time is no longer available. No new payment was submitted.");
    const [attempt] = await tx<{
      id: string;
      order_id: string;
      token_hash: string;
      status: string;
    }>`select * from square_payment_attempts where id=${input.attemptId} or (order_id=${order.id} and status in ('pending','unknown')) for update`;
    if (
      attempt &&
      (attempt.order_id !== order.id ||
        attempt.id !== input.attemptId ||
        attempt.token_hash !== hash ||
        attempt.status === "declined")
    )
      throw new Error("A payment attempt already exists. Check payment status before retrying.");
    if (!attempt)
      await tx`insert into square_payment_attempts(id,order_id,token_hash) values(${input.attemptId},${order.id},${hash})`;
    await tx`update commerce_orders set square_customer_id=${customer.id!} where id=${order.id}`;
  });
  let payment: Square.Payment | undefined;
  try {
    ({ payment } = await client.payments.create({
      idempotencyKey: squareKey("pay", input.attemptId),
      sourceId: input.sourceId,
      amountMoney: { amount: BigInt(chargeCents), currency: "USD" },
      autocomplete: true,
      locationId: c.locationId,
      customerId: customer.id,
      referenceId: order.id,
      buyerEmailAddress: order.email,
      note: order.square_payment_id
        ? "First-month fee (no assessment on file)"
        : "Oklahoma Prospects " + order.snapshot.title,
    }));
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    const declined = Boolean(
      status && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429,
    );
    await sql`update square_payment_attempts set status=${declined ? "declined" : "unknown"} where id=${input.attemptId} and status='pending'`;
    return { url: "", declined, message: safePaymentError(error) };
  }
  if (!payment?.id)
    return {
      url: "",
      declined: false,
      message: "Payment confirmation is pending. Retry this payment to check the same attempt.",
    };
  // Retrieve from Square even for the immediate response; never trust browser status.
  const verified = await client.payments.get({ paymentId: payment.id });
  if (!verified.payment) throw new Error("Payment confirmation is pending.");
  await sql.transaction((tx) => fulfillSquarePayment(tx, verified.payment!, c));
  if (verified.payment.status === "COMPLETED" && order.snapshot.recurring) {
    try {
      await provisionSubscription(order.id, client);
    } catch {
      /* Durable pending flag is retried by webhook/worker. Never charge again. */
    }
  }
  return { url, declined: false, message: "" };
}
