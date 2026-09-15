import Stripe from "stripe";
import { getSql, type Sql } from "../db";
import { stripeClient, paymentMode } from "./stripe.server";
import { grantCredits, carryOneSession } from "./store.server";
import type { Quote } from "./contracts";

type Order = { id: string; user_id: string | null; athlete_id: string | null; product_id: string;
  total_cents: number; status: string; snapshot: Quote; subscription_id: string | null; checkout_session_id: string | null };
const stripeId = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id || null;
const instant = (seconds: number) => new Date(seconds * 1000);

export async function storeSubscription(tx: Sql, sub: Stripe.Subscription) {
  const orderId = sub.metadata.order_id;
  if (!orderId) return null;
  const [order] = await tx<Order>`select * from commerce_orders where id = ${orderId}`;
  if (!order) throw new Error("Subscription order is not recorded yet.");
  const item = sub.items.data[0];
  if (!item) throw new Error("Subscription has no billing item.");
  await tx`insert into club_subscriptions (id,order_id,user_id,athlete_id,product_id,customer_id,status,amount_cents,period_start,period_end,cancel_at_period_end)
    values (${sub.id},${order.id},${order.user_id},${order.athlete_id},${order.product_id},${stripeId(sub.customer)!},${sub.status},${order.snapshot.regularCents},
      ${instant(item.current_period_start).toISOString()},${instant(item.current_period_end).toISOString()},${sub.cancel_at_period_end})
    on conflict (id) do update set status = excluded.status, period_start = excluded.period_start, period_end = excluded.period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now()`;
  await tx`update commerce_orders set subscription_id = ${sub.id}, stripe_customer_id = ${stripeId(sub.customer)} where id = ${order.id}`;
  return order;
}

export async function fulfillCheckout(tx: Sql, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;
  const id = session.metadata?.order_id;
  if (!id || session.client_reference_id !== id) throw new Error("Checkout order mismatch.");
  const [order] = await tx<Order>`select * from commerce_orders where id = ${id} for update`;
  if (!order || session.amount_total !== order.total_cents || session.currency !== "usd") throw new Error("Checkout amount mismatch.");
  if (order.checkout_session_id && order.checkout_session_id !== session.id) throw new Error("Checkout session mismatch.");
  if (["paid","refunded","cancelled","refunding","payment_review"].includes(order.status)) return;
  const bookings = await tx<{ id: string; status: string }>`select id,status from booking_records where order_id = ${id}`;
  if (bookings.some(b => b.status !== "held" && b.status !== "confirmed")) {
    // Never mark a paid but unavailable session confirmed. The office sees the exception.
    await tx`update commerce_orders set status = 'payment_review', payment_intent_id = ${stripeId(session.payment_intent)}, paid_at = now() where id = ${id}`;
    await tx`insert into club_requests (id,user_id,kind,payload) values (${"payment-review:" + id},${order.user_id},'payment-review',${JSON.stringify({ orderId: id, reason: "Payment arrived after the booking hold expired. Refund or reschedule required." })}::jsonb) on conflict do nothing`;
    return;
  }
  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  await tx`update commerce_orders set status = 'paid', checkout_session_id = ${session.id}, payment_intent_id = ${stripeId(session.payment_intent)},
    stripe_customer_id = ${stripeId(session.customer)}, subscription_id = ${stripeId(session.subscription)}, receipt_url = ${charge?.receipt_url || null}, paid_at = now(), updated_at = now() where id = ${id}`;
  await tx`update booking_records set status = 'confirmed' where order_id = ${id} and status = 'held'`;
  if (!order.snapshot.recurring && order.snapshot.kind === "package") {
    const start = new Date(); const end = new Date(start.getTime() + order.snapshot.expiresDays * 86_400_000);
    await grantCredits(tx, { key: `purchase:${id}`, userId: order.user_id, athleteId: order.athlete_id, orderId: id, quote: order.snapshot, start, end });
  }
  if (order.product_id === "s5") {
    await tx`insert into club_requests (id,user_id,kind,payload)
      values (${"video-intake:"+order.id},${order.user_id},'video-review-intake',${JSON.stringify({orderId:order.id,athleteId:order.athlete_id})}::jsonb)
      on conflict do nothing`;
  }
  // Assessments remain incomplete until the assigned coach records completion.
}

export async function processStripeEvent(event: Stripe.Event, dependencies?: {stripe:Stripe;sql:Sql;mode:"test"|"live"}) {
  const stripe = dependencies?.stripe || stripeClient();
  if (event.livemode !== ((dependencies?.mode || paymentMode()) === "live")) throw new Error("Payment environment mismatch.");
  const sql = dependencies?.sql || await getSql();
  const [seen] = await sql`select id from stripe_events where id = ${event.id}`;
  if (seen) return;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const current = await stripe.checkout.sessions.retrieve(event.data.object.id, { expand: ["payment_intent.latest_charge", "subscription"] });
    await sql.transaction(async tx => {
      const inserted = await tx`insert into stripe_events (id,type) values (${event.id},${event.type}) on conflict do nothing returning id`;
      if (!inserted.length) return;
      if (current.subscription && typeof current.subscription === "object") await storeSubscription(tx, current.subscription);
      await fulfillCheckout(tx, current);
    });
    return;
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = await stripe.invoices.retrieve(event.data.object.id);
    const subscriptionId = stripeId(invoice.parent?.subscription_details?.subscription);
    if (!subscriptionId) return;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await sql.transaction(async tx => {
      const inserted = await tx`insert into stripe_events (id,type) values (${event.id},${event.type}) on conflict do nothing returning id`;
      if (!inserted.length) return;
      const order = await storeSubscription(tx, subscription);
      if (!order) return;
      // Use the recurring invoice line's service period, not the delivery time or server clock.
      const line = invoice.lines.data.find(l => l.parent?.subscription_item_details) || invoice.lines.data[0];
      if (!line) throw new Error("Invoice period is missing.");
      const start = instant(line.period.start), end = instant(line.period.end);
      await tx`insert into billing_invoices (id,user_id,subscription_id,amount_cents,status,invoice_url,pdf_url,period_start,period_end)
        values (${invoice.id},${order.user_id},${subscription.id},${invoice.amount_paid},${invoice.status || "open"},${invoice.hosted_invoice_url},${invoice.invoice_pdf},${start.toISOString()},${end.toISOString()})
        on conflict (id) do update set status = excluded.status, amount_cents = excluded.amount_cents, invoice_url = excluded.invoice_url, pdf_url = excluded.pdf_url`;
      if (invoice.status !== "paid" || event.type !== "invoice.paid") return;
      if (invoice.currency !== "usd") throw new Error("Invoice currency mismatch.");
      const initial = invoice.billing_reason === "subscription_create";
      const expected = initial ? order.total_cents : order.snapshot.regularCents;
      if (invoice.amount_paid !== expected) throw new Error("Invoice amount does not match this membership.");
      if (["refunded","cancelled","refunding","payment_review"].includes(order.status)) return;
      if (!initial && ["m1","m2","m3"].includes(order.product_id)) await carryOneSession(tx, subscription.id, start, end);
      const [booking] = await tx`select id from booking_records where order_id = ${order.id}`;
      await grantCredits(tx, { key: `invoice:${invoice.id}`, userId: order.user_id, athleteId: order.athlete_id,
        orderId: order.id, subscriptionId: subscription.id, quote: order.snapshot, start, end, initialBooking: initial && Boolean(booking) });
    });
    return;
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    // Retrieve the latest version so out-of-order webhooks cannot restore old billing state.
    const subscription = await stripe.subscriptions.retrieve(event.data.object.id);
    await sql.transaction(async tx => {
      const inserted = await tx`insert into stripe_events (id,type) values (${event.id},${event.type}) on conflict do nothing returning id`;
      if (inserted.length) await storeSubscription(tx, subscription);
    });
    return;
  }
  if (event.type === "refund.updated" || event.type === "refund.created" || event.type === "refund.failed") {
    const refund = await stripe.refunds.retrieve(event.data.object.id);
    await sql.transaction(async tx=>{
      const inserted=await tx`insert into stripe_events(id,type) values(${event.id},${event.type}) on conflict do nothing returning id`;
      if(!inserted.length)return;
      const [row]=await tx<{order_id:string}>`update commerce_refunds set status=${refund.status || "pending"} where stripe_refund_id=${refund.id} returning order_id`;
      if(row && refund.status==='succeeded')await tx`update commerce_orders set status=case when total_cents=${refund.amount} then 'refunded' else 'cancelled' end where id=${row.order_id}`;
      if(row && (refund.status==='failed'||refund.status==='canceled'))await tx`insert into club_requests(id,user_id,kind,payload) values(${"refund-failed:"+refund.id},null,'refund-failed',${JSON.stringify({orderId:row.order_id,refundId:refund.id})}::jsonb) on conflict do nothing`;
    });return;
  }
  if(event.type === 'charge.refunded') {
    const charge=await stripe.charges.retrieve(event.data.object.id);
    await sql.transaction(async tx=>{
      const inserted=await tx`insert into stripe_events(id,type) values(${event.id},${event.type}) on conflict do nothing returning id`;
      if(!inserted.length || !charge.refunded)return;
      const orders=await tx<{id:string}>`update commerce_orders set status='refunded' where payment_intent_id=${stripeId(charge.payment_intent)} returning id`;
      for(const order of orders){
        await tx`update credit_grants set remaining=0 where order_id=${order.id}`;
        await tx`delete from booking_occupancy where booking_id in(select id from booking_records where order_id=${order.id} and status <> 'completed')`;
        await tx`update booking_records set status='cancelled' where order_id=${order.id} and status <> 'completed'`;
      }
    });return;
  }
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await sql.transaction(async tx => {
      const session = event.data.object;
      const [order] = await tx<{ id: string }>`update commerce_orders set status = 'failed' where checkout_session_id = ${session.id} and status = 'pending' returning id`;
      if (order) {
        await tx`delete from booking_occupancy where booking_id in (select id from booking_records where order_id = ${order.id} and status = 'held')`;
        await tx`update booking_records set status = 'expired' where order_id = ${order.id} and status = 'held'`;
      }
      await tx`insert into stripe_events (id,type) values (${event.id},${event.type}) on conflict do nothing`;
    });
  }
}

export async function stripeWebhook(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) return new Response("Webhook unavailable", { status: 503 });
  const body = await request.text();
  if (body.length > 1_000_000) return new Response("Request too large", { status: 413 });
  let event: Stripe.Event;
  try { event = stripeClient().webhooks.constructEvent(body, request.headers.get("stripe-signature") || "", process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return new Response("Invalid webhook signature", { status: 400 }); }
  try { await processStripeEvent(event); return Response.json({ received: true }); }
  catch { return new Response("Payment event requires retry", { status: 500 }); }
}
