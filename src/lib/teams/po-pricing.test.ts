import test from "node:test";
import assert from "node:assert/strict";
import { defaultBudget, calculateFees, project } from "./fee-model";
import {
  seedMasterMatrix,
  budgetFromMatrix,
  linkedPODraft,
  normalizePOMaster,
  seasons,
} from "./budget-matrix";
import { feeHealth } from "./fee-health";
import { sampleClub } from "./seed";
const organizations = [
  [75, 125, 125, 125, 175],
  [75, 150, 125, 150, 200],
  [100, 150, 125, 150, 200],
  [100, 150, 125, 150, 225],
  [125, 175, 150, 175, 225],
  [125, 200, 150, 200, 275],
  [125, 200, 175, 200, 275],
  [150, 225, 200, 225, 300],
  [150, 225, 200, 275, 350],
  [150, 250, 225, 350, 375],
  [150, 275, 225, 375, 375],
  [175, 275, 225, 375, 400],
];
const discounts = [
  [175, 250, 175, 200, 400],
  [175, 250, 175, 200, 400],
  [175, 250, 200, 200, 425],
  [175, 275, 200, 225, 425],
  [175, 275, 200, 225, 450],
  [175, 275, 225, 225, 450],
  [200, 300, 225, 250, 475],
  [200, 300, 225, 275, 500],
  [200, 325, 250, 275, 500],
  [225, 325, 250, 325, 525],
  [225, 325, 250, 350, 525],
  [225, 350, 275, 375, 550],
];
test("all 120 rows match supplied PO organization, membership and discount matrices", () => {
  const m = seedMasterMatrix(),
    team = sampleClub().teams[0];
  for (const r of m.rows) {
    const s = seasons.indexOf(r.season),
      b = budgetFromMatrix(team, m, r),
      f = calculateFees(b);
    assert.equal(b.poOrg, organizations[r.age - 6][s] * 100);
    assert.equal(f.poMember, [375, 525, 375, 375, 900][s] * 100);
    assert.equal(f.poDiscount, discounts[r.age - 6][s] * 100);
    assert.equal(f.poAllocation, f.allocation);
    assert.equal(f.poSubsidy, 0);
  }
});
test("team costs, premiums, uniforms, hotels and cents move both fees equally before processing", () => {
  const b = {
    ...defaultBudget(),
    fullOrg: 60000,
    poOrg: 37500,
    months: 2.5,
    fullIncremental: 1001,
    uniformCost: 17001,
    tournament: 199999,
    hotelNightly: 20000,
    hotelNights: 3,
    contingencyBps: 1500,
    costs: [{ id: "matrix-head", name: "Head", cents: 200001 }],
    headPremiumBps: 1000,
  };
  const before = calculateFees(b);
  assert.equal(before.poDiscount, 35000);
  for (const patch of [
    { uniformCost: 25007 },
    { tournament: 399999 },
    { hotelNights: 7 },
    { headPremiumBps: 2500 },
    { fullIncremental: 3903 },
  ]) {
    const after = calculateFees({ ...b, ...patch });
    assert.equal(after.fullNet - before.fullNet, after.poNet - before.poNet);
    assert.equal(after.allocation, after.poAllocation);
  }
  const roster = project(b, 10, 2);
  assert.equal(roster.full, before.full);
  assert.equal(roster.direct, before.direct + 2 * (b.uniformCost + b.fullIncremental));
  assert.equal(roster.membership, 10 * 50000 + 2 * 37500);
  assert.equal(
    roster.extraContribution,
    roster.extraRevenue - roster.extraCosts - 2 * before.poContingency,
  );
  assert.ok(roster.extraContribution < roster.extraRevenue);
  assert.equal(
    roster.totalRevenue,
    roster.direct + roster.reserve + roster.processing + roster.serviceCosts + roster.contribution,
  );
});
test("PO processing funds its own card charges; subsidy overrides are explicit and cannot hide expense", () => {
  const b = {
    ...defaultBudget(),
    fullOrg: 60000,
    poOrg: 37500,
    poEnabled: true,
    costs: [{ id: "a", name: "Coach", cents: 500000 }],
    processingBps: 290,
    processingFixed: 30,
  };
  for (const roundTo of [0, 2500]) {
    const f = calculateFees({ ...b, roundTo });
    assert.ok(f.po - f.poProcessing >= f.poNet);
    assert.equal(f.poSubsidy, 0);
  }
  const subsidized = { ...b, poTeamBps: 5000, poProcessingBps: 0 };
  const f = calculateFees(subsidized);
  assert.ok(f.poSubsidy > 0);
  assert.ok(f.poProcessing > 0);
  assert.ok(feeHealth(subsidized).pending.some((x) => x.includes("explicit admin override")));
  assert.ok(
    !feeHealth({
      ...subsidized,
      poOverrideReason: "Owner approved and funded this subsidy.",
    }).pending.some((x) => x.includes("explicit admin override")),
  );
});
test("legacy snapshots retain their exact fee; only working drafts upgrade and explicit new overrides persist", () => {
  const team = sampleClub().teams[0],
    m = seedMasterMatrix();
  const legacy = {
    ...defaultBudget(),
    poModel: undefined,
    poOrg: 0,
    poSharedAllocation: 0,
    months: 2.5,
    fullOrg: 60000,
    costs: [{ id: "a", name: "Coach", cents: 500000 }],
  };
  const before = calculateFees(legacy);
  const upgraded = linkedPODraft(legacy, m, team);
  assert.equal(calculateFees(legacy).po, before.po);
  assert.equal(calculateFees(upgraded).poAllocation, calculateFees(upgraded).allocation);
  assert.equal(upgraded.poMembershipMonthly, 15000);
  assert.equal(
    linkedPODraft({ ...upgraded, poMembershipMonthly: 14500, poTeamBps: 9500 }, m, team).poTeamBps,
    9500,
  );
  const oldMaster = {
    ...m,
    poMembershipMonthly: undefined,
    rows: m.rows.map(({ poOrganization, ...r }) => r),
  };
  assert.equal(normalizePOMaster(oldMaster).rows[0].poOrganization, 7500);
});
