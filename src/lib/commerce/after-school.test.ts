import test from "node:test";
import assert from "node:assert/strict";
import { calculateQuote, checkoutInput, type CheckoutInput, type Product } from "./contracts";
import { afterSchoolCents } from "../after-school";
import { checkoutReturnPath, parsePaySearch, quoteCages } from "../pay";
import type { PublicCatalog } from "../ops";
const cages = [
  ["individual", 50],
  ["team", 60],
  ["field", 75],
].map(([id, price]) => ({
  id,
  price,
  kind: "cage",
  name: id,
  active: true,
  minutes: 60,
  credits: 0,
  remote: 0,
  expires_days: 0,
  hours: 0,
  discipline: "Cage",
})) as Product[];
const base: CheckoutInput = {
  requestId: "2b4f82b4-4321-4321-8321-000000000001",
  productId: "individual",
  kind: "cage",
  name: "Test",
  email: "test@example.invalid",
  household: true,
  schoolAge: true,
  athleteCount: 2,
  consent: false,
  laneIds: ["1"],
  date: "2026-09-21",
  time: "16:00",
  duration: 60,
};
function quote(extra: Partial<CheckoutInput> = {}) {
  return calculateQuote({ ...base, ...extra }, cages[0], false, cages);
}
test("approved offer is $20/$35 per eligible cage and records its promotion", () => {
  assert.equal(quote({ duration: 30 }).totalCents, 2000);
  assert.equal(quote().totalCents, 3500);
  assert.equal(quote().promotionId, "after-school-2026-09");
  assert.equal(quote({ laneIds: ["1", "2"] }).totalCents, 7000);
  assert.equal(quote({ laneIds: ["1", "3-4"] }).totalCents, 11000);
  assert.equal(quote({ laneIds: ["3-4"] }).totalCents, 7500);
});
test("trial dates, weekdays, and 6 PM finish are enforced by server quote", () => {
  for (const date of ["2026-09-20", "2026-10-03", "2026-09-26", "2026-09-27"])
    assert.equal(quote({ date }).totalCents, 5000, date);
  assert.equal(quote({ date: "2026-10-02", time: "17:00" }).totalCents, 3500);
  assert.equal(quote({ time: "17:30", duration: 30 }).totalCents, 2000);
  for (const time of ["15:30", "17:30", "18:00", "16:99", ""])
    assert.equal(quote({ time }).totalCents, 5000, time);
});
test("no student attestation, teams, and other durations retain standard rates", () => {
  assert.equal(quote({ schoolAge: false }).totalCents, 5000);
  assert.equal(quote({ schoolAge: undefined }).totalCents, 5000);
  assert.equal(quote({ household: false }).totalCents, 6000);
  assert.equal(quote({ athleteCount: 3 }).totalCents, 6000);
  assert.equal(quote({ laneIds: ["1", "2", "5"] }).totalCents, 18000);
  assert.equal(quote({ duration: 90 }).totalCents, 7500);
  assert.equal(quote({ duration: 120 }).totalCents, 10000);
  assert.equal(checkoutInput.safeParse({ ...base, schoolAge: "true" }).success, false);
  assert.equal(checkoutInput.safeParse({ ...base, totalCents: 1 }).success, false);
});
test("public estimate matches server and sign-in preserves student selection", () => {
  const catalog = { cages: cages.map((p) => ({ id: p.id, price: p.price })) } as PublicCatalog;
  for (const minutes of [30, 60, 90]) {
    const estimate = quoteCages(catalog, {
      rate: "individual",
      use: "household",
      laneIds: ["1", "3-4"],
      minutes,
      date: base.date,
      time: base.time,
      schoolAge: true,
    });
    assert.equal(
      Math.round(estimate!.price * 100),
      quote({ duration: minutes, laneIds: ["1", "3-4"] }).totalCents,
    );
  }
  const path = checkoutReturnPath({ kind: "cage", id: "individual", schoolAge: true });
  assert.equal(
    parsePaySearch(Object.fromEntries(new URLSearchParams(path.split("?")[1]))).schoolAge,
    true,
  );
  assert.equal(
    afterSchoolCents({
      date: "2026-09-21",
      time: "16:00",
      duration: 60,
      schoolAge: true,
      household: true,
      athleteCount: 2,
      laneCount: 3,
      field: false,
    }),
    null,
  );
});
