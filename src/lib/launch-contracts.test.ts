import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCommerceReady, missingLaunchGates, validateCoachAssignments,
  canSubmitMerchandiseOrder, sanitizeBotEvidence, COMMERCE_GATES,
} from "./launch-contracts";

test("all commerce offerings fail closed until every evidenced launch gate passes", () => {
  assert.equal(missingLaunchGates({}).length, COMMERCE_GATES.length);
  assert.throws(() => assertCommerceReady({}), /Checkout launch blocked/);
  const evidence = Object.fromEntries(COMMERCE_GATES.map(g => [g, {
    passed: true, reference: "sandbox-run-123", checkedAt: "2026-10-09T12:00:00Z",
  }]));
  assert.doesNotThrow(() => assertCommerceReady(evidence));
  evidence.ownerApproved.reference = "";
  assert.throws(() => assertCommerceReady(evidence), /ownerApproved/);
});

test("one active head coach per team and season; assistants and multiple teams supported", () => {
  const a = { teamId: "15u-a", coachId: "coach-1", seasonId: "2027", role: "head" as const, active: true };
  const b = { ...a, teamId: "15u-b" };
  const assistant = { ...a, coachId: "coach-2", role: "assistant" as const };
  assert.doesNotThrow(() => validateCoachAssignments([a, b, assistant]));
  assert.throws(() => validateCoachAssignments([a, { ...a, coachId: "coach-3" }]), /one active head/i);
  assert.throws(() => validateCoachAssignments([a, a]), /Duplicate/);
  assert.throws(() => validateCoachAssignments([{ ...a, coachId: "" }]), /canonical coach/);
});

test("merchandise checkout fails closed for any missing shipping or fulfillment proof", () => {
  const complete = {
    activeSku: true, inventoryReserved: true, addressValidated: true,
    shippingQuoted: true, taxQuoted: true, paymentProviderReady: true,
    fulfillmentProviderReady: true,
  };
  assert.equal(canSubmitMerchandiseOrder(complete), true);
  for (const key of Object.keys(complete) as (keyof typeof complete)[]) {
    assert.equal(canSubmitMerchandiseOrder({ ...complete, [key]: false }), false, key);
  }
});

test("bot evidence drops unexpected personal data and rejects unbounded metrics", () => {
  const valid = {
    version: 1 as const, eventType: "booking.paid", objectId: "aggregate:2026-10-09",
    correlationId: "batch:001", occurredAt: "2026-10-09T12:00:00Z",
    source: "read-only-report", environment: "sandbox" as const,
    counts: { bookings: 3 },
  };
  assert.deepEqual(sanitizeBotEvidence({ ...valid, customerEmail: "private@example.com" } as typeof valid), valid);
  assert.throws(() => sanitizeBotEvidence({ ...valid, counts: { bookings: -1 } }), /aggregate/);
  assert.throws(() => sanitizeBotEvidence({ ...valid, eventType: "x@example.com" }), /metadata/);
});
