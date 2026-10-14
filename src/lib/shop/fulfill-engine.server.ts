import { createHash } from "node:crypto";
import { z } from "zod";
import { dollarsToCents, type ShopVariant } from "./contracts";
import type { Env } from "./provider.server";

export const FULFILL_ENGINE_LAUNCH_BLOCKER =
  "Fulfill Engine sales are pending verified pre-checkout shipping, complete decorated costs and a tested fulfillment connection. No payment has been requested.";
export type FulfillEngineRequest = <T>(path: string, body?: unknown) => Promise<T>;
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
// This phase exposes only documented read operations. No order can be manufactured by this client.
export function fulfillEngineClient(
  env: Env = process.env,
  send: typeof fetch = fetch,
): FulfillEngineRequest {
  if (!env.FULFILL_ENGINE_API_KEY || !env.FULFILL_ENGINE_ACCOUNT_ID)
    throw new Error(
      "Fulfill Engine is not connected. Complete the Platform Connect account request first.",
    );
  const account = identifier.parse(env.FULFILL_ENGINE_ACCOUNT_ID);
  return async <T>(path: string, body?: unknown): Promise<T> => {
    if (
      !/^\/(authentication-test|catalogproducts(?:\/ids)?|product-catalog\/inventory|campaigns\/[a-zA-Z0-9_-]+\/products(?:\/account-prices)?)$/.test(
        path,
      )
    )
      throw new Error("Unsupported Fulfill Engine operation.");
    const response = await send(`https://api.fulfillengine.com/api/accounts/${account}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "X-API-KEY": env.FULFILL_ENGINE_API_KEY!, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? "Fulfill Engine denied access. Check the account ID, API key and account permissions."
          : "Fulfill Engine is temporarily unavailable. No product changes were saved.",
      );
    const raw = await response.text();
    if (path === "/authentication-test") return undefined as T;
    return JSON.parse(raw) as T;
  };
}
export function fulfillEngineCampaign(env: Env = process.env) {
  if (!env.FULFILL_ENGINE_CAMPAIGN_ID)
    throw new Error("Configure the Fulfill Engine campaign ID for the approved Prospects designs.");
  return identifier.parse(env.FULFILL_ENGINE_CAMPAIGN_ID);
}
export async function inspectFulfillEngineConnection(request = fulfillEngineClient()) {
  await request("/authentication-test");
  return {
    connected: true,
    message:
      "Fulfill Engine authenticated successfully. Catalog permissions, decorated products, complete costs, shipping and live fulfillment still require verification.",
  };
}
const catalogSchema = z.array(
  z.object({
    id: identifier,
    name: z.string().nullable(),
    brand: z.string().nullable(),
    description: z.string().nullable().optional(),
    eligiblePrintingMethods: z.array(z.string()).nullable().optional(),
  }),
);
export async function browseFulfillEngineCatalog(query: string, request = fulfillEngineClient()) {
  // Account-scoped IDs are authoritative; the full system catalog can contain unavailable styles.
  const allowed = new Set(z.array(identifier).parse(await request("/catalogproducts/ids", {})));
  const products = catalogSchema.parse(await request("/catalogproducts", {}));
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = products.filter(
    (p) =>
      allowed.has(p.id) &&
      terms.every((t) => `${p.brand} ${p.name} ${p.id}`.toLowerCase().includes(t)),
  );
  return {
    total: matches.length,
    products: matches
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        name: p.name || p.id,
        brand: p.brand || "",
        methods: p.eligiblePrintingMethods || [],
      })),
  };
}
const options = z.object({
  color: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  option1: z.string().nullable().optional(),
  option2: z.string().nullable().optional(),
  option3: z.string().nullable().optional(),
});
const productSchema = z.object({
  id: identifier,
  catalogProductId: identifier,
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  designId: identifier,
  disabled: z.boolean(),
  customizations: z.array(z.unknown()).nullable().optional(),
  variants: z
    .array(z.object({ sku: identifier, options }))
    .min(1)
    .max(500),
});
const pricesSchema = z.object({
  products: z.array(
    z.object({
      productId: identifier,
      variants: z.array(z.object({ sku: identifier, price: z.number().positive() })).min(1),
    }),
  ),
});
const inventorySchema = z.object({
  products: z.array(
    z.object({
      productId: identifier,
      skus: z.array(z.object({ sku: identifier, isAvailable: z.boolean().nullable() })),
    }),
  ),
});
export async function fetchFulfillEngineProduct(
  id: string,
  request = fulfillEngineClient(),
  campaign = fulfillEngineCampaign(),
) {
  identifier.parse(id);
  identifier.parse(campaign);
  const products = z
    .array(productSchema)
    .parse(await request(`/campaigns/${campaign}/products`, { campaignProductIds: [id] }));
  const p = products.find((p) => p.id === id);
  if (!p || products.length !== 1 || p.disabled)
    throw new Error("Choose one enabled Fulfill Engine product with a saved production design.");
  if (p.customizations?.length)
    throw new Error("Personalized supplier products need a customization workflow before import.");
  const [rawPrices, rawInventory] = await Promise.all([
    request(`/campaigns/${campaign}/products/account-prices`, { productIds: [id] }),
    request("/product-catalog/inventory", { productIds: [p.catalogProductId] }),
  ]);
  const price = pricesSchema.parse(rawPrices).products.find((v) => v.productId === id);
  const stock = inventorySchema
    .parse(rawInventory)
    .products.find((v) => v.productId === p.catalogProductId);
  if (!price || !stock)
    throw new Error("Supplier variant costs or inventory could not be verified.");
  const variants: ShopVariant[] = p.variants.map((v) => {
    const costs = price.variants.filter((c) => c.sku === v.sku);
    const inventory = stock.skus.filter((s) => s.sku === v.sku);
    if (costs.length !== 1 || inventory.length !== 1)
      throw new Error("Supplier SKU pricing or inventory is incomplete.");
    const key = parseInt(createHash("sha256").update(v.sku).digest("hex").slice(0, 12), 16) + 1;
    return {
      id: key,
      label: Object.values(v.options).filter(Boolean).join(" / ") || v.sku,
      priceCents: dollarsToCents(costs[0].price),
      vendorCostCents: dollarsToCents(costs[0].price),
      available: inventory[0].isAvailable === true,
      item: { variant_id: key, files: [], options: [] },
      fulfillment: {
        sku: v.sku,
        designId: p.designId,
        campaignId: campaign,
        catalogProductId: p.catalogProductId,
      },
    };
  });
  if (new Set(variants.map((v) => v.id)).size !== variants.length)
    throw new Error("Duplicate supplier variants require review.");
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        campaign,
        id: p.id,
        design: p.designId,
        catalog: p.catalogProductId,
        variants: variants.map((v) => v.fulfillment!.sku).sort(),
      }),
    )
    .digest("hex");
  return {
    id: p.id,
    title: p.name,
    description: (p.description || "").replace(/<[^>]*>/g, " ").slice(0, 5000),
    variants,
    hash,
  };
}
