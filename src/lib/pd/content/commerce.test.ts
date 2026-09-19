import assert from "node:assert/strict";
import test from "node:test";
import { MEMBERSHIPS_INIT, PACKAGES_INIT, SERVICES_INIT, earningAmount } from "./commerce.ts";
import { cancelQuote, earningStatus } from "../commerce-engine.ts";
import type { Booking, Policy } from "../types.ts";

test("catalog paste is complete", () => {
  assert.equal(SERVICES_INIT.length, 12);
  assert.equal(PACKAGES_INIT.length, 3);
  assert.equal(MEMBERSHIPS_INIT.length, 5);
  assert.equal(SERVICES_INIT[0].coachSplit, 55);
  assert.equal(MEMBERSHIPS_INIT[2].price, 449);
  assert.equal(MEMBERSHIPS_INIT[0].price, 239);
});

test("earnings stay pending until complete", () => {
  const paid: Booking = {
    id: "x",
    athleteId: "a",
    serviceId: "s3",
    date: "2026-09-16",
    time: "17:00",
    status: "paid",
    price: 100,
    payout: "unpaid",
  };
  assert.equal(earningStatus(paid), "pending");
  assert.equal(earningStatus({ ...paid, status: "completed" }), "payable");
  assert.equal(earningStatus({ ...paid, status: "completed", payout: "paid" }), "paid");
  assert.equal(earningAmount(100, "s3"), 60);
  assert.equal(earningAmount(149, "s1"), 82);
});

test("cancel quote shows fee before confirm", () => {
  const policy: Policy = {
    freeCancelHours: 48,
    partialRefundHours: 24,
    lateCancelFeePct: 50,
    noShowFeePct: 100,
    newFamilyCredit: 0,
    rescheduleDaysNotice: 5,
    reschedulesPerMonth: 1,
    verifyActivities: true,
  };
  const inside: Booking = {
    id: "c",
    athleteId: "a",
    serviceId: "s3",
    date: "2026-09-14",
    time: "18:00",
    status: "paid",
    price: 100,
  };
  const quote = cancelQuote(inside, policy, new Date("2026-09-14T17:00:00Z"));
  assert.equal(quote.feePct, 100);
  assert.equal(quote.fee, 100);
  const window50: Booking = { ...inside, date: "2026-09-15", time: "18:00" };
  assert.equal(cancelQuote(window50, policy, new Date("2026-09-14T17:00:00Z")).feePct, 50);
  const later: Booking = { ...inside, date: "2026-09-20", time: "17:00" };
  assert.equal(cancelQuote(later, policy, new Date("2026-09-14T17:00:00Z")).fee, 0);
});
