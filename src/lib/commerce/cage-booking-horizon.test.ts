import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAGE_BOOKING_DAYS,
  cageBookingLastDate,
  chicagoDate,
} from "../scheduling";
import {
  withinBookingHorizon,
  assertCageBookingHorizon,
} from "./booking-policy.server";

test("all cage customers share an inclusive 14-day Chicago date horizon", () => {
  const now = new Date("2026-10-09T02:30:00Z"); // Oct 8, 9:30 PM in Chicago
  assert.equal(CAGE_BOOKING_DAYS, 14);
  assert.equal(chicagoDate(now), "2026-10-08");
  assert.equal(cageBookingLastDate(now), "2026-10-22");
  assert.equal(withinBookingHorizon("2026-10-08", 14, now), true);
  assert.equal(withinBookingHorizon("2026-10-22", 14, now), true);
  assert.equal(withinBookingHorizon("2026-10-23", 14, now), false);
  assert.equal(withinBookingHorizon("2026-10-07", 14, now), false);
  assert.doesNotThrow(() => assertCageBookingHorizon("2026-10-22", now));
  assert.throws(() => assertCageBookingHorizon("2026-10-23", now), /14 days ahead/);
});

test("the limit uses calendar days across daylight-saving changes", () => {
  const now = new Date("2026-03-01T18:00:00Z");
  assert.equal(cageBookingLastDate(now), "2026-03-15");
  assert.equal(withinBookingHorizon("2026-03-15", 14, now), true);
  assert.equal(withinBookingHorizon("2026-03-16", 14, now), false);
  assert.equal(cageBookingLastDate(new Date("2026-12-31T18:00:00Z")), "2027-01-14");
});

test("invalid or forged booking dates cannot pass the window guard", () => {
  const now = new Date("2026-02-20T18:00:00Z");
  for (const date of ["", "2026-02-30", "2026-2-20", "2026-02-21T00:00", "2099-01-01"]) {
    assert.equal(withinBookingHorizon(date, 14, now), false, date);
  }
  assert.equal(withinBookingHorizon("2026-02-20", -1, now), false);
});

test("availability, checkout and public copy use the same horizon, not an All-Star priority window", () => {
  const checkout = readFileSync("src/lib/commerce/checkout.server.ts", "utf8");
  const booking = readFileSync("src/components/booking-funnel.tsx", "utf8");
  const club = readFileSync("src/lib/club.ts", "utf8");
  const home = readFileSync("src/routes/index.tsx", "utf8");
  assert.match(checkout, /withinBookingHorizon\(input\.date, CAGE_BOOKING_DAYS\)/);
  assert.match(checkout, /checkCageBookingWindow\(me\.billingHouseholdIds, input\.date\)/);
  assert.doesNotMatch(checkout, /requirePriorityPolicy/);
  assert.match(booking, /max=\{maxDate\}/);
  assert.match(booking, /cageBookingLastDate\(\)/);
  assert.doesNotMatch(club + home, /first pick of times|14-day priority booking/i);
});
