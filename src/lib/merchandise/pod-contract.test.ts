import test from "node:test";
import assert from "node:assert/strict";
import { estimatedGrossMarginCents, MERCH_CHECKOUT_ENABLED, validateMerchProduct } from "./pod-contract";

test("store remains payment-disabled until Shopify and POD are configured", () => {
  assert.equal(MERCH_CHECKOUT_ENABLED, false);
});
test("cannot publish an unmapped POD variant or imageless product", () => {
  const p = { id:"hat-1", title:"Prospects Hat", category:"hats" as const, status:"published" as const, imageUrls:[], variants:[{sku:"HAT-NAVY",color:"Navy",size:"One size",retailCents:3000,estimatedProductionCents:1500,estimatedShippingCents:500}] };
  assert.deepEqual(validateMerchProduct(p), ["Published variant needs fulfillment mapping", "Published product needs images"]);
  assert.deepEqual(validateMerchProduct({...p, imageUrls:["https://example.com/hat.jpg"], variants:[{...p.variants[0],providerVariantId:"provider-123"}]}),[]);
});
test("gross margin is estimated, not a checkout total",()=>{
  assert.equal(estimatedGrossMarginCents(3000,1500,500),1000);
  assert.throws(()=>estimatedGrossMarginCents(-1,1500,500));
});
