import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { commerceIdentityFor } from "../commerce/access.server";
import { squarePublicConfig, squareConfig } from "../commerce/square.server";
import { assertSquareCheckoutScope } from "../commerce/square-config";
import type { Quote } from "../commerce/contracts";
import type { SquareOrder } from "../commerce/square-payments.server";
import {
  selectedLines,
  shopCheckoutSchema,
  type ShopProduct,
  type ShopCheckout,
} from "./contracts";
import {
  providerClient,
  parseProduct,
  estimate,
  retailTax,
  orderBody,
  type Env,
  type Provider,
} from "./provider.server";
export function shopReadiness(env: Env = process.env) {
  const context = env.SQUARE_DEPLOY_CONTEXT || env.CONTEXT;
  return {
    vendor: Boolean(env.PRINTFUL_ACCESS_TOKEN && env.PRINTFUL_STORE_ID),
    tax: Boolean(env.SHOP_STRIPE_TAX_SECRET_KEY && env.SHOP_TAX_CONFIGURED === "true"),
    enabled: env.MERCH_CHECKOUT_ENABLED === "true",
    accepted: context === "production" && env.MERCH_LIVE_ACCEPTED === "true",
    worker: Boolean(env.SHOP_WORKER_SECRET),
  };
}
export function assertShopReady() {
  const r = shopReadiness();
  const c = squareConfig();
  if (
    !r.vendor ||
    !r.tax ||
    !r.enabled ||
    !r.accepted ||
    !r.worker ||
    c.environment !== "production"
  )
    throw new Error("The shop is not accepting payments yet.");
  assertSquareCheckoutScope(c, { kind: "merchandise", recurring: false });
  return c;
}
export async function owner(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw new Error("Owner access required.");
  return me;
}
export async function publicShop(sql: Sql) {
  const products =
    await sql<ShopProduct>`select * from shop_products where published and sample_approved order by category,title`;
  let checkout = false;
  try {
    assertShopReady();
    checkout = true;
  } catch {
    /* Availability is intentionally fail closed. */
  }
  return {
    checkout,
    square: checkout ? squarePublicConfig() : null,
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      image_url: p.image_url,
      size_guide: p.size_guide,
      team_label: p.team_label,
      variants: p.variants.map((v) => ({
        id: v.id,
        label: v.label,
        priceCents: v.priceCents,
        available: v.available,
      })),
    })),
  };
}
export async function shopOrders(sql: Sql, userId: string, all = false) {
  const me = await commerceIdentityFor(sql, userId);
  if (all && me.role !== "admin") throw new Error("Owner access required.");
  return sql<{
    id: string;
    status: string;
    total_cents: number;
    created_at: Date;
    snapshot: Quote;
    fulfillment_status: string;
    shipments: { carrier: string; tracking_number: string; tracking_url: string }[];
    last_error: string | null;
  }>`select o.id,o.status,o.total_cents,o.created_at,o.snapshot,d.status as fulfillment_status,d.shipments,case when ${all} then d.last_error else null end as last_error from commerce_orders o join shop_order_details d on d.order_id=o.id where (${all} or o.user_id=${userId}) order by o.created_at desc limit 100`;
}
export async function importProduct(
  sql: Sql,
  userId: string,
  id: string,
  provider: Provider = providerClient(),
) {
  await owner(sql, userId);
  const p = parseProduct(await provider("/store/products/" + encodeURIComponent(id)));
  if (p.id !== id) throw new Error("Product identity mismatch.");
  await sql`insert into shop_products(id,title,image_url,variants,updated_by) values(${p.id},${p.title},${p.image},${JSON.stringify(p.variants)}::jsonb,${userId}) on conflict(id) do update set title=excluded.title,image_url=excluded.image_url,variants=excluded.variants,published=false,sample_approved=false,revision=shop_products.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
  return p.id;
}
export type PublishProduct = {
  id: string;
  revision: number;
  description: string;
  sizeGuide: string;
  teamLabel: string;
  category: string;
  taxCode: string;
  sampleApproved: boolean;
  published: boolean;
};
export async function publishProduct(sql: Sql, userId: string, input: PublishProduct) {
  await owner(sql, userId);
  if (
    input.published &&
    (!input.sampleApproved ||
      !input.sizeGuide.trim() ||
      !input.description.trim() ||
      !/^txcd_\d{8}$/.test(input.taxCode))
  )
    throw new Error(
      "Approve a physical sample and add the product description, size guide, and Stripe Tax category before publishing.",
    );
  const updated =
    await sql`update shop_products set description=${input.description},size_guide=${input.sizeGuide},team_label=${input.teamLabel},category=${input.category},tax_code=${input.taxCode},sample_approved=${input.sampleApproved},published=${input.published},revision=revision+1,updated_by=${userId},updated_at=now() where id=${input.id} and revision=${input.revision} returning id`;
  if (!updated.length) throw new Error("Product changed. Reload before saving.");
}
export async function createShopQuote(
  sql: Sql,
  userId: string,
  input: ShopCheckout,
  deps?: { provider: Provider; tax: typeof retailTax; environment: string },
) {
  const c = deps ? { environment: deps.environment } : assertShopReady();
  const data = shopCheckoutSchema.parse(input);
  const me = await commerceIdentityFor(sql, userId);
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const prior = await sql<{
    id: string;
    request_hash: string;
    user_id: string;
    snapshot: Quote;
    hold_until: Date;
  }>`select o.id,o.user_id,o.snapshot,o.hold_until,d.request_hash from commerce_orders o join shop_order_details d on d.order_id=o.id where o.request_key=${"shop:" + data.requestId}`;
  if (prior.length) {
    if (prior[0].user_id !== userId || prior[0].request_hash !== hash)
      throw new Error("Checkout retry does not match.");
    return {
      orderId: prior[0].id,
      quote: prior[0].snapshot,
      expiresAt: new Date(prior[0].hold_until).toISOString(),
    };
  }
  const products =
    await sql<ShopProduct>`select * from shop_products where id=any(${data.cart.map((i) => i.productId)}::text[])`;
  const selected = selectedLines(products, data.cart);
  const subtotal = selected.reduce((sum, i) => sum + i.variant.priceCents * i.quantity, 0);
  if (subtotal > 250000) throw new Error("Please contact us about orders over $2,500.");
  const body = orderBody(
    data.address,
    me.email,
    selected.map((i) => ({
      ...i.variant.item,
      quantity: i.quantity,
      retail_price: (i.variant.priceCents / 100).toFixed(2),
      name: i.product.title + " · " + i.variant.label,
    })),
  );
  const cost = await estimate(deps?.provider || providerClient(), body);
  // Leave at least 20% of retail merchandise revenue before processor fees and operating costs.
  if (cost.total - cost.shipping > Math.floor(subtotal * 0.8))
    throw new Error("An item needs a price review before checkout. No payment has been taken.");
  const tax = await (deps?.tax || retailTax)(
    data.address,
    selected.map((i) => ({
      id: String(i.variant.id),
      quantity: i.quantity,
      priceCents: i.variant.priceCents,
      taxCode: i.product.tax_code,
    })),
    cost.shipping,
  );
  const total = subtotal + cost.shipping + tax.cents;
  const quote: Quote = {
    productId: "shop",
    kind: "merchandise",
    title: "Oklahoma Prospects merchandise",
    totalCents: total,
    regularCents: total,
    setupCents: 0,
    recurring: false,
    assessment: false,
    duration: 0,
    sessionMinutes: 0,
    credits: 0,
    remote: 0,
    expiresDays: 0,
    discipline: "",
    resources: [],
    teamRate: false,
    needsSlot: false,
    lines: [
      ...selected.map((i) => ({
        label: `${i.quantity} × ${i.product.title} · ${i.variant.label}`,
        cents: i.variant.priceCents * i.quantity,
      })),
      { label: "Standard shipping", cents: cost.shipping },
      { label: "Sales tax", cents: tax.cents },
    ],
  };
  const id = randomUUID(),
    expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
  return sql.transaction(async (tx) => {
    // Serialize quote creation against product edits and compare all revisions again.
    const current =
      await tx<ShopProduct>`select * from shop_products where id=any(${products.map((p) => p.id)}::text[]) order by id for update`;
    if (
      current.some((p) => products.find((v) => v.id === p.id)?.revision !== p.revision) ||
      current.length !== products.length
    )
      throw new Error("A product changed. Refresh your bag.");
    selectedLines(current, data.cart);
    const inserted =
      await tx`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,currency,hold_until,payment_provider,payment_environment) values(${id},${"shop:" + data.requestId},${userId},${me.email},'shop','merchandise',${JSON.stringify(quote)}::jsonb,${total},'usd',${expiresAt},'square',${c.environment}) on conflict(request_key) do nothing returning id`;
    if (!inserted.length)
      throw new Error("This checkout is already being prepared. Retry the same request.");
    await tx`insert into shop_order_details(order_id,user_id,request_hash,vendor_body,vendor_cap_cents,product_revisions,tax_evidence) values(${id},${userId},${hash},${JSON.stringify({ ...body, external_id: id.replaceAll("-", "") })}::jsonb,${cost.total},${JSON.stringify(Object.fromEntries(products.map((p) => [p.id, p.revision])))}::jsonb,${JSON.stringify(tax.evidence)}::jsonb)`;
    return { orderId: id, quote, expiresAt };
  });
}
export async function validateShopPayment(sql: Sql, order: SquareOrder) {
  assertShopReady();
  const [d] = await sql<{
    product_revisions: Record<string, number>;
    status: string;
  }>`select product_revisions,status from shop_order_details where order_id=${order.id} and user_id=${order.user_id}`;
  if (!d || d.status !== "awaiting-payment") throw new Error("Shop checkout is unavailable.");
  const products =
    await sql<ShopProduct>`select * from shop_products where id=any(${Object.keys(d.product_revisions)}::text[]) order by id for update`;
  if (
    products.length !== Object.keys(d.product_revisions).length ||
    products.some(
      (p) => !p.published || !p.sample_approved || p.revision !== d.product_revisions[p.id],
    )
  )
    throw new Error("An item changed. Refresh your bag before paying.");
}
export async function fulfillShopPayment(sql: Sql, order: SquareOrder) {
  const late = order.status !== "pending" || new Date(order.hold_until).getTime() <= Date.now();
  await sql`update commerce_orders set status=${late ? "payment_review" : "paid"},updated_at=now() where id=${order.id}`;
  await sql`update shop_order_details set status=${late ? "review" : "queued"},last_error=${late ? "Payment completed after quote expiry; owner review required." : null},updated_at=now() where order_id=${order.id} and status='awaiting-payment'`;
  await sql`insert into payment_notifications(id,order_id,kind) values(${(late ? "owner-review:" : "receipt:") + order.id},${order.id},${late ? "owner-payment-review" : "receipt"}) on conflict do nothing`;
}
