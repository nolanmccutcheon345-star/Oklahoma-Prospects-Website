import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const memberCard = readFileSync("src/components/pricing-cards.tsx", "utf8").split(
  "export function MembershipCard",
)[1];
const cards = readFileSync("src/components/membership-plans.tsx", "utf8") + memberCard;
test("public cage-pass cards cannot misroute closed checkout into inquiry-first sales", () => {
  assert.doesNotMatch(memberCard, /Ask about|enrollment is by inquiry|to="\/contact"/i);
  assert.match(cards, /canPurchase\(availability,\s*"cage-plan",\s*plan.id\)/);
  assert.match(cards, /Checkout unavailable/);
  assert.match(cards, /Checking checkout/);
  assert.match(cards, /<Button disabled/);
  assert.match(cards, /to="\/pay"/);
});
test("cage passes remain distinguishable from the lesson assessment gate", () => {
  assert.match(cards, /Household athletes only/);
  assert.match(cards, /to="\/training"/);
  assert.doesNotMatch(cards, /assessmentComplete|FIRST_MONTH_SETUP_CENTS/);
});
