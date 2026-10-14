import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { dollarsToCents, safeHttps } from "./contracts";
import { providerClient, ProviderError, type Provider, type VendorOrder } from "./provider.server";
import { assertShopReady } from "./store.server";
export type Job = {
  order_id: string;
  vendor_body: Record<string, unknown>;
  vendor_cap_cents: number;
  status: string;
  attempts: number;
  provider_id: string | null;
  provider: "printful" | "printify" | "fulfill-engine";
  vendor_create_started_at: Date | null;
  vendor_shipping_cents: number | null;
};
/** Poll authenticated provider state. No unsigned webhook can change fulfillment. */
export async function processShopOrders(
  sql: Sql,
  provided?: Provider | { printify: import("./printify.server").PrintifyRequest; base: string },
) {
  const token = randomUUID();
  const job = await sql.transaction(async (tx) => {
    const [j] =
      await tx<Job>`select d.* from shop_order_details d join commerce_orders o on o.id=d.order_id where d.status in ('queued','processing','submitted','partial','hold') and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now()) and o.status='paid' and o.payment_environment='production' and not exists(select 1 from square_payments p where p.order_id=o.id and p.refunded_cents>0) order by d.next_attempt_at,d.order_id for update of d skip locked limit 1`;
    if (!j) return null;
    if (!provided) assertShopReady(j.provider);
    if (j.attempts >= 8) {
      await tx`update shop_order_details set status='review',last_error='Repeated fulfillment failures; owner review required.' where order_id=${j.order_id}`;
      return null;
    }
    await tx`update shop_order_details set lease_token=${token},lease_until=now()+interval '3 minutes',attempts=attempts+1,status=case when status='queued' then 'processing' else status end where order_id=${j.order_id}`;
    return j;
  });
  if (!job) return { processed: 0 };
  try {
    if (job.provider === "fulfill-engine") {
      await sql`update shop_order_details set status='review',last_error='Fulfill Engine production submission is not enabled. No supplier order was created.',lease_token=null,lease_until=null where order_id=${job.order_id} and lease_token=${token}`;
      return { processed: 1 };
    }
    if (job.provider === "printify") {
      const deps = provided && typeof provided !== "function" ? provided : undefined;
      await (
        await import("./printify-fulfillment.server")
      ).processPrintifyJob(sql, job, token, deps?.printify, deps?.base);
      return { processed: 1 };
    }
    const provider = typeof provided === "function" ? provided : providerClient();
    const ref = String(job.vendor_body.external_id);
    let order: VendorOrder | undefined;
    try {
      order = await provider<VendorOrder>("/orders/@" + ref);
    } catch (e) {
      if (!(e instanceof ProviderError) || e.status !== 404) throw e;
    }
    if (!order && job.provider_id)
      throw new Error("Previously created supplier order is missing; manual review required.");
    if (!order) order = await provider<VendorOrder>("/orders", job.vendor_body); // Draft only; external ID uniquely prevents duplicate orders.
    if (
      order.external_id !== ref ||
      !Number.isSafeInteger(order.id) ||
      (job.provider_id && String(order.id) !== job.provider_id)
    )
      throw new Error("Fulfillment identity mismatch.");
    await sql`update shop_order_details set provider_id=${String(order.id)} where order_id=${job.order_id} and lease_token=${token}`;
    if (order.status === "draft") {
      if (
        order.costs?.currency !== "USD" ||
        dollarsToCents(order.costs.total) > job.vendor_cap_cents
      ) {
        await sql`update shop_order_details set status='review',last_error='Supplier cost changed or is unavailable. Draft has not been submitted.',lease_token=null,lease_until=null where order_id=${job.order_id} and lease_token=${token}`;
        return { processed: 1 };
      }
      const [ok] =
        await sql`select d.order_id from shop_order_details d join commerce_orders o on o.id=d.order_id where d.order_id=${job.order_id} and d.lease_token=${token} and d.status in ('processing','queued','submitted','partial','hold') and o.status='paid' and not exists(select 1 from square_payments p where p.order_id=o.id and p.refunded_cents>0)`;
      if (!ok) return { processed: 0 };
      order = await provider<VendorOrder>("/orders/" + order.id + "/confirm", {});
    }
    if (
      order.external_id !== ref ||
      !Number.isSafeInteger(order.id) ||
      (job.provider_id && String(order.id) !== job.provider_id)
    )
      throw new Error("Fulfillment confirmation identity mismatch.");
    const state =
      order.status === "fulfilled"
        ? "shipped"
        : order.status === "partial"
          ? "partial"
          : ["failed", "canceled", "cancelled"].includes(order.status)
            ? "review"
            : ["onhold", "inreview"].includes(order.status)
              ? "hold"
              : "submitted";
    const shipments = (order.shipments || []).map((s) => ({
      id: s.id,
      carrier: s.carrier,
      tracking_number: s.tracking_number,
      tracking_url: safeHttps(s.tracking_url),
      shipped_at: s.shipped_at,
    }));
    await sql`update shop_order_details set status=${state},shipments=${JSON.stringify(shipments)}::jsonb,last_error=${state === "review" ? "Supplier reports " + order.status + ". Review fulfillment and any customer refund." : null},attempts=0,next_attempt_at=now()+interval '30 minutes',lease_token=null,lease_until=null,updated_at=now() where order_id=${job.order_id} and lease_token=${token}`;
  } catch {
    await sql`update shop_order_details set last_error='Fulfillment update unavailable; retry queued.',next_attempt_at=now()+interval '10 minutes',lease_token=null,lease_until=null,updated_at=now() where order_id=${job.order_id} and lease_token=${token}`;
  }
  return { processed: 1 };
}
