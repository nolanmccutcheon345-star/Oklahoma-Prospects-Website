import assert from "node:assert/strict";
import test from "node:test";
import { calculateQuote, checkoutInput, type Product } from "./contracts";
import { eligibility } from "../pricing";
import { hasOneRachaelCage, RACHAEL_CAGE_SERVICE, RACHAEL_COACH_ID } from "../rachael-cage";

const product: Product = {
  id: RACHAEL_CAGE_SERVICE, kind: "lesson", name: "Rachael cage", price: 35, minutes: 60,
  credits: 0, remote: 0, expires_days: 0, hours: 0, discipline: "Pitching", active: true,
};
const input = checkoutInput.parse({
  requestId: "a63c3de8-269a-4934-80b9-d900ba1f955a",
  productId: product.id, kind: "lesson", coachId: RACHAEL_COACH_ID,
  name: "Test Parent", email: "test@example.test",
});

test("Rachael's booking is a one-time 60-minute $35 cage charge without assessment", () => {
  const quote = calculateQuote(input, product, false);
  assert.equal(quote.totalCents, 3500);
  assert.equal(quote.regularCents, 3500);
  assert.equal(quote.duration, 60);
  assert.equal(quote.recurring, false);
  assert.equal(quote.assessment, false);
  assert.equal(quote.needsSlot, true);
  assert.equal(eligibility("lesson", "s3", false).locked, true);
  assert.equal(eligibility("package", product.id, false).locked, true);
});
test("Rejects other coaches, inactive catalog, changed fixed terms and promos", () => {
  assert.throws(() => calculateQuote({ ...input, coachId: "wrong" }, product, false));
  assert.throws(() => calculateQuote({ ...input, coachId: undefined }, product, false));
  assert.throws(() => calculateQuote(input, { ...product, active: false }, false));
  assert.throws(() => calculateQuote(input, { ...product, minutes: 30 }, false));
  assert.throws(() => calculateQuote(input, { ...product, price: 40 }, false));
  assert.throws(() => calculateQuote({ ...input, discountCode: "TEST" }, product, false));
});
test("Requires exactly one configured cage and not the fielding area", () => {
  assert.equal(hasOneRachaelCage([`coach:${RACHAEL_COACH_ID}`, "lane:7", "athlete:a"]), true);
  for (const invalid of [[], ["lane:3-4"], ["lane:8"], ["lane:2", "lane:7"]]) {
    assert.equal(hasOneRachaelCage(invalid), false);
  }
});
