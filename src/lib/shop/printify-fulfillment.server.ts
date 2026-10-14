import type { Sql } from "../db";
import { safeHttps } from "./contracts";
import {
  assertPrintifyOrder,
  printifyClient,
  printifyOrderCost,
  recoverPrintifyOrder,
  shopPath,
  verifyPrintifyProducts,
  type PrintifyBody,
  type PrintifyOrder,
  type PrintifyRequest,
} from "./printify.server";
import type { Job } from "./fulfillment.server";

export async function processPrintifyJob(
  sql: Sql,
  job: Job,
  token: string,
  request: PrintifyRequest = printifyClient(),
  base = shopPath(),
) {
  const body = job.vendor_body as unknown as PrintifyBody;
  async function review(reason: string) {
    await sql`update shop_order_details set status='review',last_error=${reason},lease_token=null,lease_until=null,updated_at=now() where order_id=${job.order_id} and lease_token=${token}`;
  }
  let order: PrintifyOrder | null = null;
  if (job.provider_id)
    order = await request<PrintifyOrder>(
      base + "/orders/" + encodeURIComponent(job.provider_id) + ".json",
    );
  else if (job.vendor_create_started_at) {
    order = await recoverPrintifyOrder(body.external_id!, request, base);
    if (!order) {
      await review(
        "Supplier order creation outcome is uncertain. Inspect Printify before any manual retry; no duplicate order was created.",
      );
      return;
    }
  } else {
    await verifyPrintifyProducts(body, request, base);
    const [eligible] =
      await sql`update shop_order_details d set vendor_create_started_at=now() from commerce_orders o where d.order_id=${job.order_id} and d.lease_token=${token} and d.vendor_create_started_at is null and o.id=d.order_id and o.status='paid' and d.status='processing' and not exists(select 1 from square_payments p where p.order_id=o.id and p.refunded_cents>0) returning d.order_id`;
    if (!eligible) return;
    // The durable marker precedes the remote write. A timeout can only recover, never blindly recreate.
    const created = await request<{ id: string }>(base + "/orders.json", {
      external_id: body.external_id,
      line_items: body.line_items,
      address_to: body.address_to,
      shipping_method: 1,
      send_shipping_notification: false,
    });
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(created.id))
      throw new Error("Supplier order response is incomplete.");
    await sql`update shop_order_details set provider_id=${created.id} where order_id=${job.order_id} and lease_token=${token}`;
    order = await request<PrintifyOrder>(base + "/orders/" + created.id + ".json");
  }
  if (!order) throw new Error("Supplier order unavailable.");
  assertPrintifyOrder(order, body);
  if (job.provider_id && order.id !== job.provider_id) {
    await review("Supplier order identity changed.");
    return;
  }
  await sql`update shop_order_details set provider_id=${order.id} where order_id=${job.order_id} and lease_token=${token}`;
  if (["on-hold", "pending"].includes(order.status)) {
    let cost;
    try {
      cost = printifyOrderCost(order);
    } catch {
      throw new Error("Supplier costs are still calculating.");
    }
    if (cost.total > job.vendor_cap_cents || cost.shipping !== job.vendor_shipping_cents) {
      await review(
        "Supplier production cost, tax or shipping changed. Order remains unsubmitted in Printify; review before approval.",
      );
      return;
    }
    await verifyPrintifyProducts(body, request, base);
    const [ok] =
      await sql`select d.order_id from shop_order_details d join commerce_orders o on o.id=d.order_id where d.order_id=${job.order_id} and d.lease_token=${token} and d.status in ('processing','queued','submitted','partial','hold') and o.status='paid' and not exists(select 1 from square_payments p where p.order_id=o.id and p.refunded_cents>0)`;
    if (!ok) return;
    await request(base + "/orders/" + order.id + "/send_to_production.json", {});
    // Read the order after the write; a successful POST alone is not proof of production.
    order = await request<PrintifyOrder>(base + "/orders/" + order.id + ".json");
    assertPrintifyOrder(order, body);
  }
  const state =
    order.status === "fulfilled"
      ? "shipped"
      : order.status === "partially-fulfilled"
        ? "partial"
        : [
              "canceled",
              "has-issues",
              "unfulfillable",
              "source-check-failed",
              "payment-not-received",
            ].includes(order.status)
          ? "review"
          : ["on-hold", "pending", "cost-calculation"].includes(order.status)
            ? "hold"
            : "submitted";
  const shipments = (order.shipments || []).map((s) => ({
    carrier: s.carrier,
    tracking_number: s.number,
    tracking_url: safeHttps(s.url),
  }));
  await sql`update shop_order_details set status=${state},shipments=${JSON.stringify(shipments)}::jsonb,last_error=${state === "review" ? "Printify reports " + order.status + ". Review the supplier order and customer payment." : null},attempts=0,next_attempt_at=now()+interval '30 minutes',lease_token=null,lease_until=null,updated_at=now() where order_id=${job.order_id} and lease_token=${token}`;
}
