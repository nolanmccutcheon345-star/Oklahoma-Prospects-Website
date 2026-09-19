import { recordRecoveryRun, recoveryHealth } from "./recovery-health.server";
import { deliverPaymentNotifications } from "./square-notifications.server";
import { getSql } from "../db";
import { clubIdentity } from "../identity.server";
import { squarePublicConfig, squareConfig, squareClient } from "./square.server";
import {
  assertPaymentRequest,
  provisionSubscription,
  fulfillSquarePayment,
} from "./square-payments.server";
import { processSquareEvent } from "./square-webhook.server";
import { executeSquareRefund } from "./square-management.server";
import { expireHolds, queueExpiredCheckoutRefunds } from "./store.server";
import { rateLimit } from "./checkout.server";
export async function requirePaymentOwner(userId: string) {
  const me = await clubIdentity(userId);
  if (me.role !== "admin") throw new Error("Owner access required.");
  return me;
}
export async function squareOffice(userId: string) {
  await requirePaymentOwner(userId);
  const sql = await getSql();
  const [payments, refunds, disputes, events, pending, subscriptions, notifications, policies] =
    await Promise.all([
      sql<{
        id: string;
        order_id: string;
        amount_cents: number;
        refunded_cents: number;
        status: string;
        created_at: Date;
      }>`select id,order_id,amount_cents,refunded_cents,status,created_at from square_payments order by created_at desc limit 100`,
      sql<{
        id: string;
        order_id: string;
        amount_cents: number;
        status: string;
        reason: string;
      }>`select id,order_id,amount_cents,status,reason from commerce_refunds order by created_at desc limit 100`,
      sql<{
        id: string;
        payment_id: string;
        state: string;
        amount_cents: number;
        due_at: Date | null;
      }>`select * from square_disputes order by updated_at desc limit 100`,
      sql<{
        id: string;
        type: string;
        status: string;
        attempts: number;
      }>`select id,type,status,attempts from square_events where status<>'processed' order by received_at limit 100`,
      sql<{
        id: string;
        status: string;
        subscription_setup_status: string | null;
      }>`select id,status,subscription_setup_status from commerce_orders where status='payment_review' or subscription_setup_status='pending' order by created_at limit 100`,
      sql<{
        id: string;
        product_id: string;
        status: string;
        scheduled_action: string | null;
        action_effective_date: string | null;
      }>`select id,product_id,status,scheduled_action,action_effective_date from club_subscriptions where payment_provider='square' order by updated_at desc limit 100`,
      sql<{
        id: string;
        kind: string;
        status: string;
      }>`select id,kind,status from payment_notifications where status<>'sent' order by created_at limit 100`,
      sql<{
        id: string;
        value: Record<string, string | number | boolean | null>;
      }>`select id,value from commerce_policy order by id`,
    ]);
  return {
    recovery: await recoveryHealth(sql, squareConfig().environment),
    config: squarePublicConfig(),
    payments,
    refunds,
    disputes,
    events,
    pending,
    subscriptions,
    notifications,
    policies,
  };
}
/** The owner explicitly approves both the amount and withdrawing unused entitlements. */
export async function manualSquareRefund(
  userId: string,
  input: {
    paymentId: string;
    amountCents: number;
    reason: string;
    requestId: string;
    withdrawUnused: boolean;
  },
) {
  await requirePaymentOwner(userId);
  assertPaymentRequest();
  await rateLimit("owner-square-refund", 10);
  const sql = await getSql(),
    c = squareConfig();
  const id = "manual:" + input.requestId;
  await sql.transaction(async (tx) => {
    const [payment] = await tx<{
      id: string;
      order_id: string;
      environment: string;
      amount_cents: number;
      refunded_cents: number;
    }>`select * from square_payments where id=${input.paymentId} for update`;
    if (!payment || payment.environment !== c.environment)
      throw new Error("Payment not found in this Square environment.");
    const [prior] = await tx<{
      square_payment_id: string;
      amount_cents: number;
      reason: string;
    }>`select * from commerce_refunds where id=${id}`;
    if (prior) {
      if (
        prior.square_payment_id !== input.paymentId ||
        prior.amount_cents !== input.amountCents ||
        prior.reason !== input.reason
      )
        throw new Error("Refund request changed.");
      return;
    }
    const [pending] = await tx<{
      cents: string;
    }>`select coalesce(sum(amount_cents),0) as cents from commerce_refunds where square_payment_id=${payment.id} and status in ('pending','unknown')`;
    if (
      input.amountCents <= 0 ||
      input.amountCents > payment.amount_cents - payment.refunded_cents - Number(pending.cents)
    )
      throw new Error("Refund exceeds the remaining payment balance.");
    const unused =
      await tx`select id from credit_grants where payment_id=${payment.id} and remaining>0 for update`;
    const booked =
      await tx`select b.id from booking_records b where b.status='confirmed' and (b.id in(select u.booking_id from credit_uses u join credit_grants g on g.id=u.grant_id where g.payment_id=${payment.id}) or (b.order_id=${payment.order_id} and not exists(select 1 from credit_uses u where u.booking_id=b.id)))`;
    if ((unused.length || booked.length) && !input.withdrawUnused)
      throw new Error(
        "Review remaining credits and future bookings, then confirm their withdrawal before refunding.",
      );
    if (input.withdrawUnused) {
      await tx`update credit_grants set remaining=0 where payment_id=${payment.id}`;
      const ids = booked.map((b) => String(b.id));
      await tx`update booking_records set status='cancelled' where id=any(${ids}::text[])`;
      await tx`delete from booking_occupancy where booking_id=any(${ids}::text[])`;
    }
    await tx`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,reason,square_payment_id,request_key)
      values(${id},${payment.order_id},${userId},${input.amountCents},'pending',${input.reason},${payment.id},${input.requestId})`;
  });
  await executeSquareRefund(id);
  return { ok: true };
}
export async function sendPaymentNotifications(orderId?: string, ownerOnly = false) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Booking email delivery is not configured.");
  const sql = await getSql(),
    c = squareConfig();
  // Recover missed owner notices for recent paid bookings without resending customer receipts.
  await sql`insert into payment_notifications(id,order_id,kind)
    select 'owner-booking:' || o.id,o.id,'owner-booking' from commerce_orders o
    where o.payment_provider='square' and o.payment_environment=${c.environment} and o.status='paid'
      and o.paid_at>now()-interval '1 day'
      and (${orderId || null}::text is null or o.id=${orderId || null})
      and exists(select 1 from booking_records b where b.order_id=o.id and b.status='confirmed' and b.ends_at>now())
    on conflict do nothing`;
  const sent = await deliverPaymentNotifications(
    sql,
    c,
    { key, from },
    undefined,
    fetch,
    orderId,
    ownerOnly,
  );
  return sent;
}
export async function sendOwnerBookingAlerts(userId: string) {
  await requirePaymentOwner(userId);
  assertPaymentRequest();
  await rateLimit("owner-booking-alerts", 5);
  const ids = await sendPaymentNotifications(undefined, true);
  return { accepted: ids.length };
}
export async function reconcileSquare() {
  const sql = await getSql(),
    c = squareConfig();
  return recordRecoveryRun(sql, c.environment, "payments", () => reconcileSquareWork());
}
async function reconcileSquareWork() {
  let failures = 0;
  const sql = await getSql(),
    c = squareConfig();
  // Recover an unknown synchronous response even when its webhook has not arrived.
  const unknown = await sql<{
    id: string;
    created_at: Date;
  }>`select distinct o.id,o.created_at from commerce_orders o join square_payment_attempts a on a.order_id=o.id where a.status in ('pending','unknown') and o.payment_environment=${c.environment} and o.created_at>now()-interval '1 day' order by o.created_at limit 20`;
  if (unknown.length) {
    const ids = new Set(unknown.map((o) => o.id));
    const client = squareClient();
    let scanned = 0;
    for await (const payment of await client.payments.list({
      locationId: c.locationId,
      beginTime: new Date(unknown[0].created_at).toISOString(),
      limit: 100,
    })) {
      if (payment.referenceId && ids.has(payment.referenceId) && payment.id) {
        const result = await client.payments.get({ paymentId: payment.id });
        if (result.payment)
          await sql.transaction((tx) => fulfillSquarePayment(tx, result.payment!, c));
      }
      if (++scanned >= 200) break;
    }
  }
  await sql.transaction((tx) => expireHolds(tx));
  await queueExpiredCheckoutRefunds(sql, c.environment);
  const pending = await sql<{
    id: string;
  }>`select id from commerce_orders where subscription_setup_status='pending' and status='paid' and payment_environment=${c.environment} limit 10`;
  for (const o of pending)
    try {
      await provisionSubscription(o.id);
    } catch {
      failures++; // Remains visible in owner queue.
    }
  const events = await sql<{
    id: string;
    type: string;
    object_id: string;
  }>`select id,type,object_id from square_events where status='pending' and environment=${c.environment} order by received_at limit 15`;
  for (const e of events)
    try {
      await processSquareEvent(e, sql);
    } catch {
      failures++; // Durable event remains retryable.
    }
  const refunds = await sql<{
    id: string;
  }>`select r.id from commerce_refunds r join square_payments p on p.id=r.square_payment_id where r.status in ('pending','unknown') and p.environment=${c.environment} order by r.created_at limit 10`;
  for (const r of refunds)
    try {
      await executeSquareRefund(r.id);
    } catch {
      failures++; // Retain original provider idempotency key.
    }
  return {
    failures,
    eventsChecked: events.length,
    refundsChecked: refunds.length,
    subscriptionsChecked: pending.length,
    ordersChecked: unknown.length,
  };
}
export async function ownerReconcile(userId: string) {
  await requirePaymentOwner(userId);
  assertPaymentRequest();
  await rateLimit("square-reconcile", 5);
  return reconcileSquare();
}
export async function verifySquareLocation(userId: string) {
  await requirePaymentOwner(userId);
  const c = squareConfig(),
    { location } = await squareClient().locations.get({ locationId: c.locationId });
  return {
    active: location?.status === "ACTIVE",
    usd: location?.currency === "USD",
    chicago: location?.timezone === "America/Chicago",
    merchantMatches: location?.merchantId === c.merchantId,
    cards: location?.capabilities?.includes("CREDIT_CARD_PROCESSING") === true,
    environment: c.environment,
  };
}

/** Read-only configuration check; signing keys never leave the server. */
export async function verifySquareWebhooks(userId: string, prepareMemberships = false) {
  await requirePaymentOwner(userId);
  const c = squareConfig();
  if (prepareMemberships) {
    assertPaymentRequest();
    await rateLimit("square-webhook-setup", 5);
  }
  const subscriptions = await squareClient().webhooks.subscriptions.list({ includeDisabled: true });
  for await (const listed of subscriptions) {
    if (listed.notificationUrl !== c.webhookUrl || !listed.id) continue;
    let { subscription } = await squareClient().webhooks.subscriptions.get({
      subscriptionId: listed.id,
    });
    if (!subscription) throw new Error("Square could not retrieve the webhook subscription.");
    if (!subscription.enabled) throw new Error("The Square webhook subscription is disabled.");
    if (subscription.signatureKey !== c.signatureKey)
      throw new Error("The Square webhook signing key does not match this site's saved key.");
    const required = ["payment.updated", "refund.updated"];
    if (c.checkoutScope === "all" || prepareMemberships)
      required.push(
        "subscription.updated",
        "invoice.payment_made",
        "invoice.scheduled_charge_failed",
        "dispute.created",
        "card.automatically_updated",
      );
    if (prepareMemberships && required.some((type) => !subscription?.eventTypes?.includes(type))) {
      await squareClient().webhooks.subscriptions.update({
        subscriptionId: listed.id,
        subscription: {
          eventTypes: [...new Set([...(subscription.eventTypes || []), ...required])],
        },
      });
      ({ subscription } = await squareClient().webhooks.subscriptions.get({
        subscriptionId: listed.id,
      }));
      if (
        !subscription?.enabled ||
        subscription.notificationUrl !== c.webhookUrl ||
        subscription.signatureKey !== c.signatureKey
      )
        throw new Error("Square webhook settings could not be verified after setup.");
    }
    if (required.some((type) => !subscription.eventTypes?.includes(type)))
      throw new Error("The Square webhook is missing required payment or membership events.");
    const sql = await getSql();
    const [result] = await sql<{
      processed: number;
      pending: number;
    }>`select count(*) filter(where status='processed')::int as processed,
      count(*) filter(where status<>'processed')::int as pending
      from square_events where environment=${c.environment}`;
    return {
      configured: true,
      processedEvents: result?.processed ?? 0,
      pendingEvents: result?.pending ?? 0,
    };
  }
  throw new Error("No Square webhook subscription matches this site's exact webhook URL.");
}

export async function setCageWindow(userId: string, standardDays: number) {
  await requirePaymentOwner(userId);
  assertPaymentRequest();
  await rateLimit("payment-policy", 10);
  const sql = await getSql();
  if (!Number.isInteger(standardDays) || standardDays < 1 || standardDays >= 14)
    throw new Error("Choose a standard window from 1 to 13 days; All-Star is 14 days.");
  await sql`insert into commerce_policy(id,value,updated_by) values('cage-booking-window',${JSON.stringify({ standardDays, allStarDays: 14 })}::jsonb,${userId}) on conflict(id) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`;
  return { ok: true };
}

/** Owner-initiated delivery check sends only to that owner's verified account. */
export async function testReceiptEmail(userId: string, messageId?: string) {
  const me = await requirePaymentOwner(userId);
  assertPaymentRequest();
  await rateLimit("owner-receipt-email-check", 10);
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("Receipt email credentials are not configured.");
  if (messageId) {
    const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(messageId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Email provider cannot confirm delivery with this API key.");
    const result = (await response.json()) as { to?: string[]; last_event?: string };
    if (result.to?.length !== 1 || result.to[0].toLowerCase() !== me.email.toLowerCase())
      throw new Error("Only your own test email can be checked.");
    return { id: messageId, status: result.last_event || "unknown" };
  }
  const ids = await deliverPaymentNotifications(
    await getSql(),
    squareConfig(),
    { key, from },
    { userId, email: me.email },
  );
  if (!ids.length)
    throw new Error(
      "No recent pending receipt from your own Sandbox payment is available, or the provider did not accept it.",
    );
  return { id: ids[0], status: "accepted" };
}

export async function setupMonthlyPlans(userId: string) {
  await requirePaymentOwner(userId);
  assertPaymentRequest();
  await rateLimit("owner-monthly-plan-setup", 5);
  const { prepareMonthlyPlans } = await import("./square-plans.server");
  const { configuredPlanVariation } = await import("./square.server");
  return prepareMonthlyPlans(
    await getSql(),
    squareClient(),
    squareConfig(),
    userId,
    configuredPlanVariation,
  );
}
