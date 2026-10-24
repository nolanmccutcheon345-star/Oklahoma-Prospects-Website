import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBudget,
  calculateFees,
  feeComposition,
  feeCostTrace,
  project,
  programDraft,
  scheduleRows,
  membershipRecognition,
} from "./fee-model";
import { pricingRevisionNeeded } from "./pricing-defaults";
import { feeHealth } from "./fee-health";
import type { FeePlan } from "./fee-contracts";

// Synthetic fixture using the owner-approved 13U agreement's cost categories.
const agreement = () => ({
  ...defaultBudget(),
  start: "2027-02-01",
  end: "2027-06-25",
  defaultMonths: 6,
  billableMonthsOverride: 6,
  billableMonthsReason: "Approved agreement bills six months; February–June are the season dates.",
  baseline: 10,
  membershipMonthly: 10000,
  poMembershipMonthly: 10000,
  fullOrg: 50000,
  poOrg: 30000,
  tournamentEstimate: 650000,
  uniformEstimate: 25000,
  contingencyBps: 1250,
  processingBps: 300,
  processingFixed: 0,
  roundTo: 2500,
  eventPaymentSchedule: { percentages: [7000, 1500, 1500], weeksBefore: [16, 12, 6] },
  costs: [
    ["Head coach", 275000],
    ["Assistant coach", 125000],
    ["Hotels", 200000],
    ["Gas", 30000],
    ["Balls", 60000],
    ["Fields", 100000],
    ["Equipment", 35000],
    ["Insurance", 25000],
    ["Background checks", 3000],
    ["Operations", 22500],
    ["Misc", 17500],
  ].map(([name, cents], i) => ({ id: `synthetic-${i}`, name: String(name), cents: Number(cents) })),
});

test("approved six-month 13U term produces $3,300 without changing service dates", () => {
  const b = agreement(),
    f = calculateFees(b),
    trace = feeCostTrace(b);
  assert.equal(f.months, 6);
  assert.equal(f.member, 60000);
  assert.equal(f.externalDirect, 1793000);
  assert.equal(f.programDirect, 600000);
  assert.equal(f.direct, 2393000);
  assert.equal(f.contingency, 299125);
  assert.equal(f.protectedBudget, 2692125);
  assert.equal(f.fullNet, 319213); // Shared costs rounded upward to one cent per player.
  assert.equal(f.full, 330000);
  assert.equal(trace.direct, trace.externalDirect + trace.programDirect);
  assert.equal(trace.allocationRounding, 5);
  assert.equal(b.start, "2027-02-01");
  assert.equal(b.end, "2027-06-25");
  assert.equal(calculateFees({ ...b, billableMonthsOverride: undefined }).months, 5);
  const rows = scheduleRows(b, f.full, "full", "2027-01-01");
  assert.deepEqual(
    rows.map((r) => r.amount),
    [231000, 49500, 49500],
  );
  assert.ok(f.full - rows.reduce((sum, r) => sum + Math.ceil(r.amount * 0.03), 0) >= f.fullNet);
  const c = feeComposition(b, "full");
  assert.equal(c.teamCosts, 179300);
  assert.equal(
    c.teamCosts + c.membership + c.contingency + c.organization + c.processing + c.adjustment,
    330000,
  );
  assert.equal(membershipRecognition(60000, b.start, b.end, b.end).deferred, 0);
  assert.ok(
    feeHealth(b).pending.some((p) => p.includes("policy")),
    "A corrected price does not satisfy missing publication requirements",
  );
});

test("historical $3,125 snapshot remains exact and draft upgrade requires a new publication", () => {
  const old = { ...agreement(), programCostModel: undefined, billableMonthsOverride: 5 };
  const frozen = structuredClone(old),
    f = calculateFees(old);
  assert.equal(f.full, 312500);
  assert.equal(f.direct, 1793000);
  assert.equal(f.contingency, 224125);
  const p = { budget: old, publishedBudget: frozen, published: { finalDue: "" } } as FeePlan;
  const draft = programDraft(old);
  assert.equal(pricingRevisionNeeded(p, draft, ""), true);
  assert.equal(
    pricingRevisionNeeded(
      { ...p, publishedBudget: draft },
      { ...draft, billableMonthsOverride: 6 },
      "",
    ),
    true,
  );
  assert.deepEqual(old, frozen);
  assert.equal(calculateFees(p.publishedBudget!).full, 312500);
});

test("program allocation is counted once in team costs and once as internal academy revenue", () => {
  const b = agreement(),
    f = calculateFees(b),
    p = project(b, 10, 0);
  assert.equal(p.direct, 2393000);
  assert.equal(p.externalDirect, 1793000);
  assert.equal(p.programDirect, 600000);
  assert.equal(p.reserve, 299125);
  assert.equal(p.beforeOverhead, p.totalRevenue - p.externalDirect - p.processing - p.reserve);
  assert.equal(
    p.teamOperatingContribution,
    p.totalRevenue - p.membership - p.organization - p.externalDirect - p.processing,
  );
  const extra = project(b, 12, 2);
  assert.equal(extra.programDirect, 14 * 60000);
  assert.equal(
    extra.reserve,
    p.reserve,
    "Added players do not duplicate the approved baseline reserve",
  );
  assert.equal(extra.beforeOverhead - p.beforeOverhead, extra.extraContribution);
  assert.equal(f.full, extra.full, "Roster expansion does not reprice the baseline");
});

test("PO program rates fund their own contingency without a false shared-cost subsidy", () => {
  for (const monthly of [0, 8000, 10000, 15001]) {
    const b = { ...agreement(), poMembershipMonthly: monthly },
      f = calculateFees(b);
    assert.equal(f.poMember, monthly * 6);
    assert.equal(f.poSubsidy, 0);
    assert.equal(f.poNet, 179300 + monthly * 6 + f.poContingency + b.poOrg);
    const c = feeComposition(b, "po");
    assert.equal(c.teamCosts, 179300);
    assert.equal(
      c.teamCosts + c.contingency + c.membership + c.organization + c.processing + c.adjustment,
      c.total,
    );
    assert.ok(c.contingency >= 22412 + Math.floor(monthly * 6 * 0.125));
  }
});
