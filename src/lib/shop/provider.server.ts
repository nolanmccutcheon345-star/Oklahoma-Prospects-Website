import { dollarsToCents, safeHttps, type ShopVariant, type PrintItem } from "./contracts";
export type Env = Record<string, string | undefined>;
export class ProviderError extends Error {
  constructor(public status: number) {
    super("The fulfillment service is temporarily unavailable. No new payment was requested.");
  }
}
export function providerClient(env: Env = process.env, send: typeof fetch = fetch) {
  if (!env.PRINTFUL_ACCESS_TOKEN || !env.PRINTFUL_STORE_ID)
    throw new Error("Fulfillment is not connected.");
  return async function request<T>(path: string, body?: unknown): Promise<T> {
    const r = await send("https://api.printful.com" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + env.PRINTFUL_ACCESS_TOKEN,
        "X-PF-Store-Id": env.PRINTFUL_STORE_ID!,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(6000),
      redirect: "error",
    });
    if (!r.ok) throw new ProviderError(r.status);
    const data = (await r.json()) as { code: number; result: T };
    if (data.code !== 200 || !data.result) throw new ProviderError(502);
    return data.result;
  };
}
export type Provider = ReturnType<typeof providerClient>;
export type VendorOrder = {
  id: number;
  external_id: string;
  status: string;
  costs?: { currency: string; total: string; shipping: string };
  shipments?: {
    id: number;
    carrier: string;
    tracking_number: string;
    tracking_url: string;
    shipped_at?: number;
  }[];
};
export function parseProduct(raw: unknown) {
  const p = raw as {
    sync_product?: { id: number; name: string; thumbnail_url: string };
    sync_variants?: {
      id: number;
      name: string;
      size?: string;
      color?: string;
      retail_price: string;
      currency: string;
      synced: boolean;
      is_ignored?: boolean;
      availability_status?: string;
      variant_id: number;
      files: { id: number; type: string; status?: string }[];
      options?: { id: string; value: unknown }[];
    }[];
  };
  if (!p.sync_product?.id || !p.sync_product.name || !p.sync_variants?.length)
    throw new Error("Configure a Printful API-store product first.");
  const variants: ShopVariant[] = p.sync_variants
    .filter((v) => v.synced && !v.is_ignored && v.currency === "USD")
    .map((v) => {
      const files = v.files
        .filter((f) => f.type !== "preview" && f.status === "ok")
        .map((f) => ({ id: f.id, type: f.type }));
      if (!files.length || !Number.isSafeInteger(v.variant_id))
        throw new Error("Approved production files are missing.");
      return {
        id: v.id,
        label: [v.color, v.size].filter(Boolean).join(" / ") || v.name,
        priceCents: dollarsToCents(v.retail_price),
        available: !v.availability_status || v.availability_status === "active",
        item: { variant_id: v.variant_id, files, options: v.options || [] },
      };
    });
  const image = safeHttps(p.sync_product.thumbnail_url);
  if (!variants.length || variants.some((v) => !v.priceCents) || !image)
    throw new Error("Product needs USD retail prices, valid variants, and a product image.");
  return { id: String(p.sync_product.id), title: p.sync_product.name, image, variants };
}
export async function estimate(provider: Provider, body: unknown) {
  const r = await provider<{ costs: { currency: string; total: string; shipping: string } }>(
    "/orders/estimate-costs",
    body,
  );
  if (r.costs?.currency !== "USD") throw new Error("USD fulfillment pricing is unavailable.");
  return { total: dollarsToCents(r.costs.total), shipping: dollarsToCents(r.costs.shipping) };
}
export async function retailTax(
  address: Record<string, string>,
  items: { id: string; quantity: number; priceCents: number; taxCode: string }[],
  shippingCents: number,
  env: Env = process.env,
  send: typeof fetch = fetch,
) {
  const key = env.SHOP_STRIPE_TAX_SECRET_KEY;
  if (!key || !/^(sk|rk)_live_/.test(key) || env.SHOP_TAX_CONFIGURED !== "true")
    throw new Error("Store tax calculation is not ready.");
  const amount = items.reduce((sum, i) => sum + i.priceCents * i.quantity, shippingCents);
  const params = new URLSearchParams({
    currency: "usd",
    "customer_details[address][country]": "US",
    "customer_details[address][state]": address.state_code,
    "customer_details[address][postal_code]": address.zip,
    "customer_details[address][city]": address.city,
    "customer_details[address][line1]": address.address1,
    "customer_details[address][line2]": address.address2 || "",
    "customer_details[address_source]": "shipping",
    "shipping_cost[amount]": String(shippingCents),
    "shipping_cost[tax_behavior]": "exclusive",
  });
  items.forEach((item, index) => {
    if (!/^txcd_\d{8}$/.test(item.taxCode)) throw new Error("Product tax category needs review.");
    const prefix = `line_items[${index}]`;
    for (const [field, value] of Object.entries({
      amount: item.priceCents * item.quantity,
      quantity: item.quantity,
      reference: item.id,
      tax_code: item.taxCode,
      tax_behavior: "exclusive",
    }))
      params.set(`${prefix}[${field}]`, String(value));
  });
  const r = await send("https://api.stripe.com/v1/tax/calculations", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(6000),
    redirect: "error",
  });
  if (!r.ok) throw new Error("Tax could not be calculated. Please try again.");
  const tax = (await r.json()) as {
    id: string;
    currency: string;
    livemode: boolean;
    expires_at: number;
    tax_amount_exclusive: number;
    tax_amount_inclusive: number;
    amount_total: number;
  };
  if (
    !tax.id?.startsWith("taxcalc_") ||
    tax.currency !== "usd" ||
    tax.livemode !== true ||
    !Number.isSafeInteger(tax.tax_amount_exclusive) ||
    tax.tax_amount_exclusive < 0 ||
    tax.tax_amount_inclusive !== 0 ||
    tax.amount_total !== amount + tax.tax_amount_exclusive ||
    !Number.isFinite(tax.expires_at) ||
    tax.expires_at * 1000 <= Date.now() + 10 * 60000
  )
    throw new Error("Tax total could not be verified.");
  return {
    cents: tax.tax_amount_exclusive,
    evidence: {
      provider: "Stripe Tax",
      calculationId: tax.id,
      calculatedAt: new Date().toISOString(),
    },
  };
}

export function orderBody(address: Record<string, string>, email: string, items: PrintItem[]) {
  return {
    recipient: { ...address, email },
    items,
    shipping: "STANDARD",
    packing_slip: {
      store_name: "Oklahoma Prospects",
      message: "Thank you for supporting Oklahoma Prospects.",
    },
  };
}
