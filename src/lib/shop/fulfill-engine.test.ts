import test from "node:test";
import assert from "node:assert/strict";
import {
  fulfillEngineClient,
  fetchFulfillEngineProduct,
  browseFulfillEngineCatalog,
  inspectFulfillEngineConnection,
  type FulfillEngineRequest,
} from "./fulfill-engine.server";
const product = {
  id: "design-product",
  name: "SYNTHETIC Performance Cap",
  catalogProductId: "cap-style",
  designId: "approved-design",
  disabled: false,
  variants: [{ sku: "sku-navy-m", options: { color: "Navy", size: "M" } }],
};
export const syntheticFE = (async (path: string) => {
  if (path.endsWith("account-prices"))
    return {
      products: [{ productId: product.id, variants: [{ sku: "sku-navy-m", price: 20.25 }] }],
    };
  if (path.endsWith("inventory"))
    return {
      products: [{ productId: "cap-style", skus: [{ sku: "sku-navy-m", isAvailable: true }] }],
    };
  return [product];
}) as FulfillEngineRequest;
test("Fulfill Engine imports actual design variants with stable IDs and supplier prices", async () => {
  const a = await fetchFulfillEngineProduct(product.id, syntheticFE, "campaign");
  const b = await fetchFulfillEngineProduct(product.id, syntheticFE, "campaign");
  assert.equal(a.variants[0].id, b.variants[0].id);
  assert.equal(a.variants[0].vendorCostCents, 2025);
  assert.equal(a.variants[0].fulfillment?.sku, "sku-navy-m");
  assert.equal(a.variants[0].available, true);
  assert.equal(a.hash, b.hash);
});
test("Fulfill Engine missing SKU costs, artwork and personalized products cannot be imported", async () => {
  for (const changed of [
    { ...product, designId: null },
    { ...product, disabled: true },
    { ...product, customizations: [{}] },
    { ...product, variants: [{ ...product.variants[0], sku: "unknown" }] },
  ]) {
    await assert.rejects(() =>
      fetchFulfillEngineProduct(
        product.id,
        (async (p, b) =>
          p.endsWith("/products") ? [changed] : syntheticFE(p, b)) as FulfillEngineRequest,
        "campaign",
      ),
    );
  }
});
test("Fulfill Engine catalog filters by account access, never by global marketing availability", async () => {
  const request = (async (path: string) =>
    path.endsWith("/ids")
      ? ["allowed"]
      : [
          { id: "allowed", name: "Performance Cap", brand: "Richardson" },
          { id: "restricted", name: "Performance Cap", brand: "Richardson" },
        ]) as FulfillEngineRequest;
  const result = await browseFulfillEngineCatalog("Richardson", request);
  assert.deepEqual(
    result.products.map((p) => p.id),
    ["allowed"],
  );
});
test("Fulfill Engine client keeps credentials server-side, rejects redirects and all order writes", async () => {
  const calls: string[] = [];
  const request = fulfillEngineClient(
    { FULFILL_ENGINE_ACCOUNT_ID: "test-account", FULFILL_ENGINE_API_KEY: "SYNTHETIC" },
    (async (url, init) => {
      calls.push(String(url));
      assert.equal(init?.redirect, "error");
      assert.equal((init?.headers as Record<string, string>)["X-API-KEY"], "SYNTHETIC");
      return new Response("", { status: 200 });
    }) as typeof fetch,
  );
  assert.equal((await inspectFulfillEngineConnection(request)).connected, true);
  for (const path of ["/orders", "https://example.invalid", "/../orders", "/orders/validate"])
    await assert.rejects(() => request(path, {}), /Unsupported/);
  assert.deepEqual(calls, [
    "https://api.fulfillengine.com/api/accounts/test-account/authentication-test",
  ]);
  assert.throws(() => fulfillEngineClient({}), /not connected/);
});
