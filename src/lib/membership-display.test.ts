import test from "node:test";
import assert from "node:assert/strict";
import { cagePlanIsHighlighted } from "./membership-display";

const plans = [
  { id: "prospect", featured: false },
  { id: "all-star", featured: false },
  { id: "elite-family", featured: false },
];

test("All-Star is the featured cage pass when the catalog has no featured flag", () => {
  assert.equal(cagePlanIsHighlighted(plans[1], plans), true);
  assert.equal(cagePlanIsHighlighted(plans[0], plans), false);
  assert.equal(cagePlanIsHighlighted(plans[2], plans), false);
});

test("an explicit featured flag wins over the All-Star fallback", () => {
  const marked = plans.map((plan) => (plan.id === "prospect" ? { ...plan, featured: true } : plan));
  assert.equal(cagePlanIsHighlighted(marked[0], marked), true);
  assert.equal(cagePlanIsHighlighted(marked[1], marked), false);
});
