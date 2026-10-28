import { createHash } from "node:crypto";
import { z } from "zod";
import type { ShopProduct, ShopVariant, ShopCheckout } from "./contracts";
import { safeHttps } from "./contracts";
import { ProviderError, type Env } from "./provider.server";

export type PrintifyRequest = <T>(path: string, body?: unknown) => Promise<T>;
export function printifyClient(
  env: Env = process.env,
  send: typeof fetch = fetch,
): PrintifyRequest {
  if (!env.PRINTIFY_ACCESS_TOKEN) throw new Error("Printify is not connected.");
  return async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await send("https://api.printify.com/v1" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + env.PRINTIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "OklahomaProspectsShop/1.0",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new ProviderError(response.status);
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  };
}
export function shopPath(env: Env = process.env) {
  if (!/^\d+$/.test(env.PRINTIFY_SHOP_ID || ""))
    throw new Error("Printify shop ID is not configured.");
  return "/shops/" + env.PRINTIFY_SHOP_ID;
}
const cents = z.number().int().min(0).max(100000000);
const productSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  blueprint_id: z.number().int().positive(),
  print_provider_id: z.number().int().positive(),
  variants: z
    .array(
      z.object({
        id: z.number().int().positive(),
        title: z.string(),
        cost: cents,
        price: cents,
        is_enabled: z.boolean(),
        is_available: z.boolean(),
      }),
    )
    .min(1),
  images: z.array(
    z.object({
      src: z.string(),
      variant_ids: z.array(z.number()).optional(),
      is_default: z.boolean().optional(),
    }),
  ),
  print_areas: z
    .array(
      z
        .object({
          variant_ids: z.array(z.number()).min(1),
          placeholders: z
            .array(
              z
                .object({
                  position: z.string().min(1),
                  images: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1),
                })
                .passthrough(),
            )
            .min(1),
        })
        .passthrough(),
    )
    .min(1),
  print_details: z.record(z.string(), z.unknown()).optional(),
});
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function parsePrintifyProduct(raw: unknown) {
  const p = productSchema.parse(raw);
  const enabled = p.variants.filter((v) => v.is_enabled);
  if (
    !enabled.length ||
    enabled.some((v) => v.cost <= 0 || !p.print_areas.some((a) => a.variant_ids.includes(v.id)))
  )
    throw new Error(
      "Enable variants with vendor costs and complete production artwork in Printify first.",
    );
  const variants: ShopVariant[] = enabled.map((v) => ({
    id: v.id,
    label: v.title,
    priceCents: v.price,
    vendorCostCents: v.cost,
    available: v.is_available,
    item: { variant_id: v.id, files: [], options: [] },
  }));
  const image = safeHttps((p.images.find((i) => i.is_default) || p.images[0])?.src);
  const hash = createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          blueprint: p.blueprint_id,
          provider: p.print_provider_id,
          areas: p.print_areas,
          details: p.print_details || {},
          variants: enabled.map((v) => v.id).sort((a, b) => a - b),
        }),
      ),
    )
    .digest("hex");
  return {
    id: p.id,
    title: p.title,
    image,
    variants,
    hash,
    description: (p.description || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000),
  };
}
export type PrintifyBody = {
  external_id?: string;
  line_items: { product_id: string; variant_id: number; quantity: number }[];
  address_to: {
    first_name: string;
    last_name: string;
    email: string;
    country: string;
    region: string;
    address1: string;
    address2: string;
    city: string;
    zip: string;
  };
  shipping_method: number;
  send_shipping_notification: boolean;
  _products: { id: string; hash: string }[];
};
export function printifyOrderBody(
  address: ShopCheckout["address"],
  email: string,
  lines: { product: ShopProduct; variant: ShopVariant; quantity: number }[],
): PrintifyBody {
  const names = address.name.trim().split(/\s+/);
  if (names.length < 2) throw new Error("Enter the recipient’s first and last name.");
  return {
    line_items: lines.map((l) => ({
      product_id: l.product.provider_product_id!,
      variant_id: l.variant.id,
      quantity: l.quantity,
    })),
    address_to: {
      first_name: names.shift()!,
      last_name: names.join(" "),
      email,
      country: "US",
      region: address.state_code,
      address1: address.address1,
      address2: address.address2,
      city: address.city,
      zip: address.zip,
    },
    shipping_method: 1,
    send_shipping_notification: false,
    _products: [
      ...new Map(
        lines.map((l) => [
          l.product.provider_product_id!,
          { id: l.product.provider_product_id!, hash: l.product.manufacturing_hash },
        ]),
      ).values(),
    ],
  };
}
export async function verifyPrintifyProducts(
  body: PrintifyBody,
  request: PrintifyRequest,
  base = shopPath(),
) {
  let production = 0;
  for (const ref of body._products) {
    const product = parsePrintifyProduct(
      await request(base + "/products/" + encodeURIComponent(ref.id) + ".json"),
    );
    if (product.id !== ref.id || product.hash !== ref.hash)
      throw new Error("Supplier artwork or variants changed. Re-sync and approve the product.");
    for (const line of body.line_items.filter((l) => l.product_id === ref.id)) {
      const v = product.variants.find((v) => v.id === line.variant_id && v.available);
      if (!v?.vendorCostCents) throw new Error("This size is unavailable at the supplier.");
      production += v.vendorCostCents * line.quantity;
    }
  }
  if (!Number.isSafeInteger(production) || production <= 0)
    throw new Error("Supplier costs are unavailable.");
  return production;
}
export async function printifyEstimate(
  body: PrintifyBody,
  request = printifyClient(),
  base = shopPath(),
) {
  const production = await verifyPrintifyProducts(body, request, base);
  const result = await request<{ standard?: number }>(base + "/orders/shipping.json", {
    line_items: body.line_items,
    address_to: body.address_to,
  });
  const shipping = cents.parse(result.standard);
  return { total: production + shipping, shipping };
}
export type PrintifyOrder = {
  id: string;
  status: string;
  metadata: { shop_order_id?: string | number };
  line_items: {
    product_id: string;
    variant_id: number;
    quantity: number;
    cost?: number;
    print_provider_id?: number;
    status?: string;
  }[];
  total_shipping?: number;
  total_tax?: number;
  shipments?: { carrier: string; number: string; url: string; delivered_at?: string }[];
};
export function printifyOrderCost(order: PrintifyOrder) {
  const shipping = cents.parse(order.total_shipping),
    tax = cents.parse(order.total_tax);
  const production = order.line_items.reduce(
    (sum, l) => sum + cents.parse(l.cost) * z.number().int().positive().parse(l.quantity),
    0,
  );
  if (production <= 0) throw new Error("Supplier costs are still calculating.");
  return { total: production + shipping + tax, shipping };
}
export function assertPrintifyOrder(order: PrintifyOrder, body: PrintifyBody) {
  if (
    !/^[a-zA-Z0-9_-]{1,100}$/.test(order.id) ||
    String(order.metadata?.shop_order_id) !== body.external_id
  )
    throw new Error("Supplier order identity mismatch.");
  const summarize = (lines: PrintifyBody["line_items"]) =>
    JSON.stringify(lines.map((l) => `${l.product_id}:${l.variant_id}:${l.quantity}`).sort());
  if (summarize(order.line_items) !== summarize(body.line_items))
    throw new Error("Supplier order items changed.");
}
export async function recoverPrintifyOrder(
  ref: string,
  request: PrintifyRequest,
  base = shopPath(),
) {
  // Bounded lookup is recovery only. Failure to find an ambiguous create never authorizes another POST.
  for (let page = 1; page <= 3; page++) {
    const result = await request<{ data: PrintifyOrder[]; last_page?: number }>(
      base + "/orders.json?limit=10&page=" + page,
    );
    if (!Array.isArray(result.data)) throw new Error("Supplier order lookup is unavailable.");
    const found = result.data.filter((o) => String(o.metadata?.shop_order_id) === ref);
    if (found.length > 1) throw new Error("Duplicate supplier orders need owner review.");
    if (found.length) return found[0];
    if (result.data.length < 10 || (result.last_page && page >= result.last_page)) return null;
  }
  return null;
}
export async function inspectPrintifyConnection(
  request = printifyClient(),
  env: Env = process.env,
) {
  const shops =
    await request<{ id: number; title: string; sales_channel: string }[]>("/shops.json");
  const shop = shops.find((s) => String(s.id) === env.PRINTIFY_SHOP_ID);
  if (!shop)
    return {
      connected: false,
      message: "Select your Printify API store ID in the production configuration.",
      shops: shops.map((s) => ({ id: String(s.id), title: s.title })),
    };
  return {
    connected: true,
    message:
      "Connected to " +
      shop.title +
      ". Reported sales channel: " +
      shop.sales_channel +
      ". Verify this is the dedicated API store, with manual approval, USD billing and disabled order routing before opening sales.",
    shops: [{ id: String(shop.id), title: shop.title }],
  };
}
