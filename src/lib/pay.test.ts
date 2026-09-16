import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicCatalog } from "./ops";
import { quoteCages, quoteCheckout, resolvePayItem } from "./pay";

const catalog = buildPublicCatalog([]);

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
