import test from "node:test";
import assert from "node:assert/strict";
import { SHOP_IMAGE_WIDTHS, allowedShopImageWidth } from "./image-widths";

test("shop image widths accept only the sizes the catalog requests", () => {
  assert.deepEqual([...SHOP_IMAGE_WIDTHS], [200, 600, 900]);
  assert.equal(allowedShopImageWidth(200), 200);
  assert.equal(allowedShopImageWidth(600), 600);
  assert.equal(allowedShopImageWidth(900), 900);
  assert.equal(allowedShopImageWidth(900.4), 900);
});

test("any other requested width snaps to the nearest allowed size or is ignored", () => {
  assert.equal(allowedShopImageWidth(undefined), undefined);
  assert.equal(allowedShopImageWidth(Number.NaN), undefined);
  assert.equal(allowedShopImageWidth(0), undefined);
  assert.equal(allowedShopImageWidth(-100), undefined);
  assert.equal(allowedShopImageWidth(1), 200);
  assert.equal(allowedShopImageWidth(399), 200);
  assert.equal(allowedShopImageWidth(401), 600);
  assert.equal(allowedShopImageWidth(1600), 900);
  assert.equal(allowedShopImageWidth(10000), 900);
});
