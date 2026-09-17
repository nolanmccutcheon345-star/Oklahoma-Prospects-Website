import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicCatalog } from "./ops";
import { checkoutParty, checkoutReturnPath, parsePaySearch, quoteCages, quoteCheckout, resolvePayItem } from "./pay";
import { calculateQuote, type Product } from "./commerce/contracts";

const catalog = buildPublicCatalog([]);

test("household booking keeps its $50 rate and choices through sign-in", () => {
  const selection = parsePaySearch({ kind: "cage", id: "individual", cages: "1", minutes: 60,
    date: "2026-09-18", time: "16:00", use: "household", athleteCount: 2 });
  const restored = parsePaySearch(Object.fromEntries(new URL(checkoutReturnPath(selection), "https://example.com").searchParams));
  assert.deepEqual(restored, selection);
  const party = checkoutParty(restored);
  const rates: Product[] = catalog.cages.map((p) => ({ ...p, kind: "cage", active: true,
    minutes: 60, credits: 0, remote: 0, expires_days: 0, hours: 0, discipline: "" }));
  const quote = calculateQuote({ requestId: "unused", productId: "individual", kind: "cage",
    laneIds: ["1"], duration: restored.minutes, household: party.household, athleteCount: party.count,
    consent: false, name: "Test", email: "test@example.com" }, rates.find(p => p.id === "individual")!, false, rates);
  assert.equal(quote.totalCents, 5000);
  assert.equal(quote.teamRate, false);
});

test("sign-in return path excludes payment and assessment claims and retains team use", () => {
  const restored = parsePaySearch(Object.fromEntries(new URL(checkoutReturnPath({ kind: "cage", id: "team", use: "team", athleteCount: 5,
    receipt: "private-receipt", assessed: "true" }), "https://example.com").searchParams));
  assert.deepEqual(checkoutParty(restored), { household: false, count: 5 });
  assert.equal(restored.receipt, undefined);
  assert.equal(restored.assessed, undefined);
  for (const athleteCount of [-1, 0, 101, 1.5, "invalid"]) {
    assert.equal(parsePaySearch({ athleteCount }).athleteCount, undefined);
  }
});

test("two cages at two hours charge for both", () => {
  const item = quoteCages(catalog, { rate: "individual", laneIds: ["1", "2"], minutes: 120 });
  assert.ok(item);
  assert.equal(item.price, 200);
  assert.equal(item.lines.length, 2);
  assert.ok(item.title.includes("2 cages"));
});

test("two cages at 90 minutes is $150 not $50", () => {
  const item = quoteCheckout(
    { kind: "cage", id: "individual", cages: "1,2", minutes: 90, use: "household" },
    catalog,
    true,
  );
  assert.ok(item);
  assert.equal(item.price, 150);
  assert.equal(item.lines.reduce((sum, line) => sum + line.amount, 0), 150);
});

test("fielding plus a hitting lane at one hour", () => {
  const item = quoteCages(catalog, { rate: "individual", laneIds: ["6", "3-4"], minutes: 60 });
  assert.ok(item);
  assert.equal(item.price, 125);
});

test("team rate applies to cage lanes only", () => {
  const item = quoteCages(catalog, { rate: "team", laneIds: ["1", "3-4"], minutes: 60, use: "team" });
  assert.ok(item);
  assert.equal(item.price, 135);
});

test("three cages force the team rate", () => {
  const item = quoteCages(catalog, {
    rate: "individual",
    laneIds: ["1", "2", "5"],
    minutes: 60,
    use: "household",
  });
  assert.ok(item);
  assert.equal(item.price, 180);
  assert.equal(item.use, "team");
});

test("resolvePayItem reads cages from the search string", () => {
  const item = resolvePayItem(
    { kind: "cage", id: "individual", cages: "1,5", minutes: 90 },
    catalog,
  );
  assert.ok(item);
  assert.equal(item.price, 150);
  assert.deepEqual(item.laneIds, ["1", "5"]);
});

test("hour lesson is locked until assessment completion", () => {
  const item = quoteCheckout({ kind: "lesson", id: "s3" }, catalog, false);
  assert.ok(item);
  assert.match(item.error || "", /assessment/i);
});

test("hour lesson with assessment stays $100", () => {
  const item = quoteCheckout({ kind: "lesson", id: "s3" }, catalog, true);
  assert.ok(item);
  assert.equal(item.price, 100);
});

test("development first month without assessment is $279", () => {
  const item = quoteCheckout({ kind: "membership", id: "m1" }, catalog, false);
  assert.ok(item);
  assert.equal(item.price, 279);
});

test("household cage plan is blocked for team use", () => {
  const item = quoteCheckout({ kind: "cage-plan", id: "all-star", use: "team" }, catalog, true);
  assert.ok(item);
  assert.ok(item.error);
});
