import test from "node:test";
import assert from "node:assert/strict";
import { serviceMonths } from "./season-months";
import { feeComposition } from "./fee-model";
import { seedMasterMatrix, budgetFromMatrix } from "./budget-matrix";
import { sampleClub } from "./seed";
import { feeHealth } from "./fee-health";
test("inclusive service periods catch the reported five versus six month mismatch", () => {
  assert.equal(serviceMonths("2027-02-01", "2027-07-31"), 6);
  assert.equal(serviceMonths("2027-02-10", "2027-07-10"), 5);
  assert.equal(serviceMonths("2028-02-01", "2028-02-29"), 1);
  assert.equal(serviceMonths("2027-02-30", "2027-07-31"), null);
  const m = seedMasterMatrix(),
    r = m.rows.find((r) => r.sport === "softball" && r.age === 14 && r.season === "springSummer")!;
  const b = budgetFromMatrix(sampleClub().teams[0], m, r);
  assert.match(
    feeHealth({ ...b, start: "2027-02-10", end: "2027-07-10" }).pending.join(" "),
    /budget bills 6/,
  );
  assert.doesNotMatch(
    feeHealth({ ...b, start: "2027-02-01", end: "2027-07-31" }).pending.join(" "),
    /budget bills/,
  );
});
test("composition reconciles every cent for full and PO, including processing and rounding", () => {
  const m = seedMasterMatrix(),
    r = m.rows.find((r) => r.sport === "softball" && r.age === 14 && r.season === "springSummer")!;
  const b = budgetFromMatrix(sampleClub().teams[0], m, r);
  const full = feeComposition(b, "full"),
    po = feeComposition(b, "po");
  assert.equal(full.total, 275000);
  assert.equal(full.teamCosts, 85050);
  assert.equal(full.contingency, 12758);
  assert.equal(full.membership, 120000);
  assert.equal(po.membership, 90000);
  assert.equal(full.teamCosts, po.teamCosts);
  assert.equal(full.contingency, po.contingency);
  for (const processingBps of [0, 300])
    for (const poProcessingBps of [0, 10000])
      for (const role of ["full", "po"] as const) {
        const f = feeComposition(
          { ...b, processingBps, processingFixed: 30, poProcessingBps },
          role,
        );
        assert.equal(
          f.teamCosts + f.contingency + f.membership + f.organization + f.processing + f.adjustment,
          f.total,
        );
      }
});
