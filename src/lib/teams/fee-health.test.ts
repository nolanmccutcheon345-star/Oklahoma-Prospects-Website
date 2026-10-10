import test from "node:test";
import assert from "node:assert/strict";
import { feeHealth, pendingGas, offersPO } from "./fee-health";
import { defaultBudget, midpointDay, scheduleRows, calculateFees } from "./fee-model";
import { seedMasterMatrix, budgetFromMatrix, masterSchema, rowKey } from "./budget-matrix";
import { sampleClub } from "./seed";
const ready = () => ({
  ...defaultBudget(),
  start: "2027-02-01",
  deadlineOverride: "2098-03-01",
  policy: "Approved payment/refund policy",
  reinstatement: "Contact office",
  end: "2027-05-15",
  noUniformReason: "Returning players reuse existing uniforms",
  processingBps: 300,
  processingFixed: 30,
  readiness: {
    schedule: true,
    gas: true,
    hotels: true,
    other: true,
    processing: true,
    noUniform: true,
  },
});
test("fee health rejects season mismatch, unreviewed inputs and unsupported zero fees", () => {
  const b = ready();
  assert.equal(feeHealth(b, { key: "softball:14:spring", overheadReviewed: true }).ready, true);
  const mismatch = feeHealth(
    { ...b, end: "2027-07-15" },
    { key: "softball:14:spring", overheadReviewed: true },
  );
  assert.equal(mismatch.ready, false);
  assert.equal(
    feeHealth({ ...b, end: "2027-07-15" }, { seasonLabel: "Spring 2027", overheadReviewed: true })
      .ready,
    false,
  );
  assert.match(mismatch.pending.join(" "), /Spring \+ Summer/);
  assert.equal(
    feeHealth(b, {
      key: "softball:14:springSummer",
      seasonLabel: "Spring 2027",
      overheadReviewed: true,
    }).ready,
    false,
  );
  for (const k of ["schedule", "gas", "hotels", "other", "processing"] as const)
    assert.equal(
      feeHealth({ ...b, readiness: { ...b.readiness, [k]: false } }, { overheadReviewed: true })
        .ready,
      false,
    );
  assert.equal(feeHealth({ ...b, noUniformReason: "" }, { overheadReviewed: true }).ready, false);
  assert.equal(
    feeHealth({ ...b, processingBps: 0, processingFixed: 0 }, { overheadReviewed: true }).ready,
    false,
  );
  assert.equal(feeHealth(b).ready, false);
  const costly = { ...b, costs: [{ id: "x", name: "Direct costs", cents: 1000000 }] };
  assert.equal(feeHealth(costly, { overheadReviewed: true, full: 0 }).status, "UNDERFUNDED");
  const gas = pendingGas({
    ...b,
    readiness: { ...b.readiness, schedule: false },
    costs: [{ id: "cost-3", name: "Coach travel", cents: 25000 }],
  });
  assert.equal(gas.costs[0].cents, 0);
  assert.equal(gas.readiness?.gas, false);
  assert.equal(offersPO(b, "softball"), false);
  assert.equal(offersPO({ ...b, poEnabled: true }, "softball"), true);
});
test("automatic second installment uses actual acceptance midpoint, with explicit override and late-acceptance block", () => {
  assert.equal(midpointDay("2027-01-01", "2027-01-29"), "2027-01-15");
  const rows = scheduleRows(defaultBudget(), 100000, "full", "2027-01-29", "2027-01-09");
  assert.deepEqual(
    rows.map((r) => r.amount),
    [40000, 30000, 30000],
  );
  assert.equal(rows[1].due, "2027-01-19");
  assert.equal(
    scheduleRows(
      { ...defaultBudget(), secondDue: "2027-01-10" },
      100000,
      "full",
      "2027-01-29",
      "2027-01-09",
    )[1].due,
    "2027-01-10",
  );
  assert.throws(() => midpointDay("2027-02-01", "2027-01-29"), /deadline/);
});
test("all 120 supplied defaults exist and fund the baseline before pending schedule-dependent costs", () => {
  const m = masterSchema.parse(seedMasterMatrix());
  let count = 0;
  for (const sport of ["baseball", "softball"] as const)
    for (let age = 6; age <= 17; age++)
      for (const [season, months] of Object.entries({
        winter: 2.5,
        spring: 3.5,
        summer: 2.5,
        fall: 2.5,
        springSummer: 6,
      })) {
        const r = m.rows.find((r) => rowKey(r) === `${sport}:${age}:${season}`)!;
        assert.ok(r);
        assert.equal(r.months, months);
        assert.equal(r.assistant, r.head / 2);
        for (const k of [
          "head",
          "assistant",
          "organization",
          "insurance",
          "background",
          "balls",
          "equipment",
          "operations",
          "misc",
          "fields",
        ] as const)
          assert.ok(Number.isSafeInteger(r[k]) && r[k] >= 0, `${rowKey(r)} ${k}`);
        const b = budgetFromMatrix({ ...sampleClub().teams[0], sport, age: age + "U" }, m, r);
        const f = calculateFees(b);
        assert.equal(f.full % 2500, 0);
        assert.ok(f.full - f.fullProcessing >= f.fullNet);
        assert.equal(b.costs.find((c) => c.id === "cost-3")?.cents, 0);
        assert.equal(b.poEnabled, false);
        count++;
      }
  assert.equal(count, 120);
});
