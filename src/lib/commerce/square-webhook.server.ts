import { WebhooksHelper, type Square, type SquareClient } from "square";
import { getSql, type Sql } from "../db";
import { squareClient, squareConfig } from "./square.server";
import {
  fulfillSquarePayment,
  provisionSubscription,
  type SquareOrder,
} from "./square-payments.server";
import { grantCredits, carryOneSession } from "./store.server";
import { addCalendarMonth } from "./catalog";
import { chicagoInstant } from "../scheduling";

type SquareSyncDependencies = {
  client: SquareClient;
  config: { environment: string; locationId: string };
  sql: Sql;
};

export async function syncSquareSubscription(id: string, dependencies?: SquareSyncDependencies) {
  const client = dependencies?.client || squareClient(),
    c = dependencies?.config || squareConfig(),
    sql = dependencies?.sql || (await getSql());
  const { subscription: s } = await client.subscriptions.get({
    subscriptionId: id,
    include: "actions",
  });
  if (!s || s.id !== id || s.locationId !== c.locationId)
    throw new Error("Subscription verification failed.");
  const [local] = await sql<{
    customer_id: string;
    payment_environment: string;
  }>`select s.customer_id,o.payment_environment from club_subscriptions s
    join commerce_orders o on o.id=s.order_id
    where s.id=${id} and s.payment_provider='square'`;
  if (!local) return;
  if (local.payment_environment !== c.environment)
    throw new Error("Subscription environment mismatch.");
  if (local.customer_id !== s.customerId) throw new Error("Subscription customer mismatch.");
  if (s.version == null || !s.status) throw new Error("Subscription response is incomplete.");
  const action =
    s.actions?.find((a) => a.type === "CANCEL") ||
    s.actions?.find((a) => a.type === "PAUSE") ||
    s.actions?.find((a) => a.type === "RESUME");
  // Compare inside the update: another webhook may have saved a newer version
  // while this Square request was in flight. Same-version action refreshes are valid.
  await sql`update club_subscriptions set status=${s.status.toLowerCase()},provider_version=${s.version.toString()},cancel_at_period_end=${Boolean(s.canceledDate || s.status === "CANCELED" || action?.type === "CANCEL")},scheduled_action=${action?.type || null},action_effective_date=${action?.effectiveDate || s.canceledDate || null},updated_at=now()
    where id=${id} and payment_provider='square'
      and (provider_version is null or provider_version<=${s.version.toString()}::bigint)`;
}
export async function syncSquareInvoice(
  id: string,
  dependencies?: SquareSyncDependencies,
  failedCharge = false,
) {
  const client = dependencies?.client || squareClient(),
    c = dependencies?.config || squareConfig(),
    sql = dependencies?.sql || (await getSql());
  const { invoice } = await client.invoices.get({ invoiceId: id });
  if (!invoice?.subscriptionId || invoice.locationId !== c.locationId) return;
  const [local] = await sql<{
    order_id: string;
    customer_id: string;
    amount_cents: number;
    period_end: Date;
  }>`select * from club_subscriptions where id=${invoice.subscriptionId} and payment_provider='square'`;
  if (!local) throw new Error("Subscription setup pending; retry invoice.");
  if (invoice.primaryRecipient?.customerId !== local.customer_id)
    throw new Error("Invoice customer mismatch.");
  const [o] = await sql<SquareOrder>`select * from commerce_orders where id=${local.order_id}`;
  if (o.payment_environment !== c.environment) throw new Error("Invoice environment mismatch.");
  const paid = invoice.status === "PAID";
  const due = invoice.paymentRequests?.[0]?.dueDate;
  if (!due) throw new Error("Invoice billing date is missing.");
  const start = chicagoInstant(due, "00:00"),
    end = chicagoInstant(
      addCalendarMonth(new Date(due + "T12:00:00Z"))
        .toISOString()
        .slice(0, 10),
      "00:00",
    );
  let payments: Square.Payment[] = [];
  if (paid) {
    if (!invoice.orderId) throw new Error("Invoice order is missing.");
    const { order } = await client.orders.get({ orderId: invoice.orderId });
    const ids = (order?.tenders || [])
      .map((t) => t.paymentId)
      .filter((v): v is string => Boolean(v));
    payments = await Promise.all(
      ids.map(async (paymentId) => {
        const r = await client.payments.get({ paymentId });
        if (!r.payment) throw new Error("Invoice payment missing.");
        return r.payment;
      }),
    );
    if (
      !payments.length ||
      payments.some(
        (p) =>
          p.status !== "COMPLETED" ||
          p.orderId !== invoice.orderId ||
          p.locationId !== c.locationId ||
          p.amountMoney?.currency !== "USD" ||
          p.totalMoney?.currency !== "USD" ||
          p.totalMoney.amount !== p.amountMoney.amount ||
          Number(p.refundedMoney?.amount || 0) > 0 ||
          p.customerId !== local.customer_id,
      ) ||
      payments.reduce((sum, p) => sum + Number(p.amountMoney!.amount), 0) !== local.amount_cents
    )
      throw new Error("Invoice payment amount or identity mismatch.");
  }
  await sql.transaction(async (tx) => {
    await tx`select id from club_subscriptions where id=${invoice.subscriptionId!} for update`;
    const [previous] = await tx<{
      status: string;
    }>`select status from billing_invoices where id=${id}`;
    // A slower unpaid response must not roll back a committed paid invoice.
    // This also prevents a later paid retry from repeating rollover/notifications.
    if (previous?.status === "paid") return;
    await tx`insert into billing_invoices(id,user_id,subscription_id,amount_cents,status,invoice_url,period_start,period_end)
      values(${id},${o.user_id},${invoice.subscriptionId!},${local.amount_cents},${invoice.status?.toLowerCase() || "pending"},${invoice.publicUrl || null},${start.toISOString()},${end.toISOString()}) on conflict(id) do update set status=excluded.status,invoice_url=excluded.invoice_url`;
    if (!paid) {
      if (failedCharge)
        await tx`insert into payment_notifications(id,order_id,kind) values(${"failed:" + id},${o.id},'renewal-failed') on conflict do nothing`;
      return;
    }
    await tx`update payment_notifications set status='resolved' where id=${"failed:" + id} and status='pending'`;
    for (const p of payments)
      await tx`insert into square_payments(id,order_id,invoice_id,environment,amount_cents,status,receipt_url,period_start,period_end)
      values(${p.id!},${o.id},${id},${c.environment},${Number(p.amountMoney!.amount)},'COMPLETED',${p.receiptUrl || null},${start.toISOString()},${end.toISOString()}) on conflict(id) do nothing`;
    if (["m1", "m2", "m3", "m4", "m5"].includes(o.snapshot.productId))
      await carryOneSession(
        tx,
        invoice.subscriptionId!,
        start,
        end,
        o.snapshot.productId === "m5" ? "remote-review" : "lesson",
      );
    await grantCredits(tx, {
      key: "invoice:" + id,
      userId: o.user_id,
      athleteId: o.athlete_id,
      orderId: o.id,
      subscriptionId: invoice.subscriptionId!,
      quote: o.snapshot,
      start,
      end,
    });
    await tx`update credit_grants set payment_id=${payments[0].id!} where source_key like ${"invoice:" + id + ":%"}`;
    await tx`update club_subscriptions set period_start=${start.toISOString()},period_end=${end.toISOString()},updated_at=now() where id=${invoice.subscriptionId!} and (period_end is null or period_end < ${end.toISOString()})`;
    await tx`insert into payment_notifications(id,order_id,kind) values(${"renewal:" + id},${o.id},'renewal') on conflict do nothing`;
  });
}
export async function syncSquareRefund(id: string) {
  const client = squareClient(),
    sql = await getSql(),
    c = squareConfig();
  const { refund } = await client.refunds.get({ refundId: id });
  if (!refund?.paymentId || refund.locationId !== c.locationId) return;
  const { payment: p } = await client.payments.get({ paymentId: refund.paymentId });
  if (
    !p ||
    p.locationId !== c.locationId ||
    (p.refundedMoney && p.refundedMoney.currency !== "USD")
  )
    throw new Error("Refund verification failed.");
  await sql.transaction(async (tx) => {
    const [local] = await tx<{
      order_id: string;
      amount_cents: number;
      environment: string;
    }>`select * from square_payments where id=${p.id!} for update`;
    if (!local) return;
    if (local.environment !== c.environment) throw new Error("Refund environment mismatch.");
    const refunded = Number(p.refundedMoney?.amount || 0);
    if (refunded > local.amount_cents) throw new Error("Refund exceeds payment.");
    await tx`update square_payments set refunded_cents=${refunded} where id=${p.id!}`;
    await tx`update commerce_refunds set status=${refund.status?.toLowerCase() || "pending"},square_refund_id=${id} where square_refund_id=${id}`;
    if (refunded === local.amount_cents) {
      const grants = await tx<{
        id: string;
      }>`select id from credit_grants where payment_id=${p.id!} for update`;
      const ids = grants.map((g) => g.id);
      await tx`update credit_grants set remaining=0 where id=any(${ids}::text[])`;
      await tx`update booking_records set status='cancelled' where status in ('held','confirmed') and (id in(select booking_id from credit_uses where grant_id=any(${ids}::text[])) or (order_id=${local.order_id} and ${p.id === (await tx<{ square_payment_id: string }>`select square_payment_id from commerce_orders where id=${local.order_id}`)[0]?.square_payment_id} and not exists(select 1 from credit_uses u where u.booking_id=booking_records.id)))`;
      await tx`delete from booking_occupancy where booking_id in(select id from booking_records where order_id=${local.order_id} and status='cancelled')`;
      await tx`update commerce_orders set status='refunded',updated_at=now() where id=${local.order_id} and not coalesce((snapshot->>'recurring')::boolean,false)`;
    }
  });
}
export async function processSquareEvent(
  event: { id: string; type: string; object_id: string },
  providedSql?: Sql,
) {
  const sql = providedSql || (await getSql());
  const [row] = await sql<{
    status: string;
  }>`select status from square_events where id=${event.id}`;
  if (row?.status === "processed") return;
  await sql`update square_events set attempts=attempts+1 where id=${event.id}`;
  const client = squareClient();
  if (event.type.startsWith("payment.")) {
    const { payment } = await client.payments.get({ paymentId: event.object_id });
    if (!payment) throw new Error("Payment unavailable.");
    await sql.transaction((tx) => fulfillSquarePayment(tx, payment, squareConfig()));
    if (payment.referenceId) await provisionSubscription(payment.referenceId, client);
  } else if (event.type.startsWith("subscription.")) await syncSquareSubscription(event.object_id);
  else if (event.type.startsWith("invoice.")) {
    await syncSquareInvoice(
      event.object_id,
      undefined,
      event.type === "invoice.scheduled_charge_failed",
    );
  } else if (event.type === "card.automatically_updated") {
    const { card } = await client.cards.get({ cardId: event.object_id });
    if (card?.id && card.customerId)
      await sql`update commerce_orders set updated_at=now() where square_card_id=${card.id} and square_customer_id=${card.customerId} and payment_environment=${squareConfig().environment}`;
  } else if (event.type.startsWith("refund.")) await syncSquareRefund(event.object_id);
  else if (event.type.startsWith("dispute.")) {
    const { dispute: d } = await client.disputes.get({ disputeId: event.object_id });
    if (d?.id && d.disputedPayment?.paymentId) {
      const [payment] = await sql<{
        order_id: string;
      }>`select order_id from square_payments where id=${d.disputedPayment.paymentId} and environment=${squareConfig().environment}`;
      if (payment) {
        await sql`insert into payment_notifications(id,order_id,kind) values(${"dispute:" + d.id},${payment.order_id},'dispute') on conflict do nothing`;
        await sql`insert into square_disputes(id,payment_id,state,amount_cents,due_at) values(${d.id},${d.disputedPayment.paymentId},${d.state || "unknown"},${Number(d.amountMoney?.amount || 0)},${d.dueAt || null}) on conflict(id) do update set state=excluded.state,due_at=excluded.due_at,updated_at=now()`;
      }
    }
  }
  await sql`update square_events set status='processed',processed_at=now() where id=${event.id}`;
}
export async function squareWebhook(request: Request) {
  const c = squareConfig();
  if (Number(request.headers.get("content-length") || 0) > 1_000_000)
    return new Response("Too large", { status: 413 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
  const valid = await WebhooksHelper.verifySignature({
    requestBody: raw,
    signatureHeader: request.headers.get("x-square-hmacsha256-signature") || "",
    signatureKey: c.signatureKey,
    notificationUrl: c.webhookUrl,
  });
  if (!valid) return new Response("Invalid signature", { status: 403 });
  let e: { event_id?: string; merchant_id?: string; type?: string; data?: { id?: string } };
  try {
    e = JSON.parse(raw);
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  if (e.merchant_id !== c.merchantId || !e.event_id || !e.data?.id || !e.type)
    return new Response("Invalid event identity", { status: 400 });
  if (!/^(payment|subscription|invoice|refund|dispute|card)\./.test(e.type))
    return new Response("Ignored");
  const sql = await getSql();
  await sql`insert into square_events(id,environment,type,object_id) values(${e.event_id},${c.environment},${e.type},${e.data.id}) on conflict(id) do nothing`;
  try {
    await processSquareEvent({ id: e.event_id, type: e.type, object_id: e.data.id }, sql);
    return new Response("OK");
  } catch {
    return new Response("Processing pending; retry", { status: 503 });
  }
}
