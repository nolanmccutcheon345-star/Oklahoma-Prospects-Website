import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calendarBillableMonths } from "./season-months";
import {
  defaultBudget,
  calculateFees,
  project,
  feeComposition,
  programDraft,
  scheduleRows,
  additionalPlayerContribution,
  membershipRecognition,
  budgetSchema,
} from "./fee-model";
import { seedMasterMatrix, normalizePOMaster, budgetFromMatrix } from "./budget-matrix";
import { feeHealth } from "./fee-health";
import { sampleClub } from "./seed";

const budget = () => ({
  ...defaultBudget(),
  start: "2027-01-01",
  end: "2027-07-31",
  months: 6,
  fullOrg: 55000,
  poOrg: 35000,
  uniformCost: 30000,
  costs: [
    { id: "team-insurance", name: "Insurance", cents: 25000 },
    { id: "events", name: "Tournament team fees", cents: 600000 },
  ],
  processingBps: 290,
  processingFixed: 30,
});

test("all historic cost matrices and business reserve survive legacy master interpretation", async () => {
  const sql = await readFile("migrations/0052_team_budget_master.sql", "utf8");
  const legacy = JSON.parse(sql.match(/VALUES\('master','(.*?)'::jsonb/s)![1]);
  const normalized = normalizePOMaster(legacy);
  assert.equal(normalized.membershipMonthly, 15000);
  assert.equal(normalized.poMembershipMonthly, 15000);
  assert.ok(!("individualAccessMonthly" in normalized));
  assert.ok(!("standaloneAccessMonthly" in normalized));
  assert.equal(normalized.reserveTarget, 2400000);
  assert.equal(normalized.contingencyBps, 1500);
  assert.equal(normalized.baseline, 10);
  assert.deepEqual(
    normalized.rows.map(({ poOrganization: _po, ...r }) => r),
    legacy.rows,
  );
  const current = seedMasterMatrix();
  assert.deepEqual(normalized.rows, current.rows);
  assert.deepEqual(normalized.gas, legacy.gas);
  assert.equal(normalized.hotelNightly, legacy.hotelNightly);
});

test("calendar billing handles partial months, cross-year dates and explicit fractional override", () => {
  assert.equal(calendarBillableMonths("2027-02-10", "2027-07-10"), 6);
  assert.equal(calendarBillableMonths("2027-01-01", "2027-07-31"), 7);
  assert.equal(calendarBillableMonths("2027-12-31", "2028-01-01"), 2);
  assert.equal(calendarBillableMonths("2028-02-29", "2028-02-29"), 1);
  assert.equal(calendarBillableMonths("2027-02-29", "2027-07-10"), null);
  assert.equal(calculateFees(budget()).member, 105000);
  assert.equal(calculateFees({ ...budget(), billableMonthsOverride: 6.5 }).member, 97500);
  assert.ok(
    feeHealth({ ...budget(), billableMonthsOverride: 6 }).pending.some((p) =>
      p.includes("Actual Billable Months"),
    ),
  );
  assert.ok(
    !feeHealth({
      ...budget(),
      billableMonthsOverride: 6,
      billableMonthsReason: "Program access starts after January.",
    }).pending.some((p) => p.includes("Actual Billable Months")),
  );
  const m = seedMasterMatrix();
  const b = budgetFromMatrix(
    { ...sampleClub().teams[0], seasonStart: "2027-01-01", seasonEnd: "2027-07-31" },
    m,
    m.rows[4],
  );
  assert.equal(b.defaultMonths, 6);
  assert.equal(b.months, 7);
});

test("required program receives contingency inside direct cost and retired membership fields cannot affect a quote", () => {
  const b = budget(),
    base = calculateFees(b);
  assert.equal(base.externalDirect, 925000);
  assert.equal(base.programDirect, 1050000);
  assert.equal(base.direct, 1975000);
  assert.equal(base.contingency, 296250);
  assert.equal(base.member, 105000);
  assert.equal(base.poMember, 105000);
  assert.equal(base.poDiscount, b.fullOrg - b.poOrg);
  const historic = { ...b, individualAccessMonthly: 99999999, standaloneAccessMonthly: 99999999 };
  assert.deepEqual(calculateFees(historic), base);
  assert.equal(
    budgetSchema.safeParse(historic).success,
    false,
    "New pricing submissions reject retired fields",
  );
  const c = feeComposition(b, "full");
  assert.equal(
    c.teamCosts + c.contingency + c.membership + c.organization + c.processing + c.adjustment,
    c.total,
  );
  assert.equal(defaultBudget().serviceCostMonthly, 0);
});

test("players 11+ do not re-fund fixed costs or automatically incur insurance/registration/contingency", () => {
  const b = {
    ...budget(),
    additionalPlayerCosts: [{ playerId: "11", insurance: 2500, registration: 4000, other: 500 }],
  };
  const base = project(budget(), 10, 0),
    extra = project(b, 11, 1);
  assert.equal(extra.full, base.full);
  assert.equal(
    project(b, 10, 0).direct,
    base.direct,
    "Additional roster exceptions cannot contaminate the ten-player baseline quote",
  );
  assert.equal(extra.reserve, base.reserve);
  assert.equal(extra.externalDirect - base.externalDirect, 2 * b.uniformCost + 7000);
  assert.equal(extra.direct - base.direct, 2 * b.uniformCost + 7000 + 2 * 105000);
  const full = additionalPlayerContribution(b, "full", b.additionalPlayerCosts[0]);
  const po = additionalPlayerContribution(b, "po", { insurance: 0, registration: 0, other: 0 });
  assert.equal(
    full.contribution,
    full.fee - full.uniform - full.processing - full.insurance - full.registration - full.other,
  );
  assert.equal(extra.extraContribution, full.contribution + po.contribution);
  assert.equal(extra.contribution - base.contribution, extra.extraContribution);
  assert.equal(
    extra.teamOperatingContribution + extra.organizationAndProgramRevenue,
    extra.totalTeamAssociatedContribution,
  );
  assert.equal(
    extra.totalTeamAssociatedContribution,
    extra.totalRevenue - extra.externalDirect - extra.processing - extra.serviceCosts,
  );
  assert.equal(extra.organizationAndProgramRevenue, extra.membership + extra.organization);
  assert.equal(
    budgetSchema.safeParse({
      ...b,
      additionalPlayerCosts: [b.additionalPlayerCosts[0], b.additionalPlayerCosts[0]],
    }).success,
    false,
  );
});

test("a team funding loss stays visible even when organization/program revenue is positive", () => {
  const p = project(budget(), 6, 0);
  assert.ok(p.teamOperatingContribution < 0);
  assert.ok(p.organizationAndProgramRevenue > 0);
  assert.ok(p.totalTeamAssociatedContribution > 0);
  assert.ok(p.baselineShortfall > 0);
});

test("legacy quotes remain exact; only working drafts acquire new program and date interpretation", () => {
  const legacy = {
    ...budget(),
    programModel: undefined,
    programCostModel: undefined,
    membershipMonthly: 20000,
    months: 6,
  };
  const before = calculateFees(legacy);
  const upgraded = programDraft(legacy);
  assert.equal(calculateFees(upgraded).member, 105000);
  assert.equal(upgraded.membershipMonthly, 15000);
  assert.deepEqual(calculateFees(legacy), before);
  assert.equal(before.member, 120000);
});

test("standard installment totals, custom amount plans and processor costs reconcile", () => {
  for (const custom of [false, true]) {
    const b = budget();
    if (custom) {
      Object.assign(b, {
        paymentSchedule: {
          mode: "percent",
          rows: [
            { full: 4000, po: 4000, due: "" },
            { full: 6000, po: 6000, due: "" },
          ],
        },
      });
      const total = calculateFees(b).full;
      Object.assign(b, {
        paymentSchedule: {
          mode: "amount",
          rows: [
            { full: 10000, po: 10000, due: "" },
            { full: total - 10000, po: calculateFees(b).po - 10000, due: "" },
          ],
        },
      });
    }
    const f = calculateFees(b);
    const rows = scheduleRows(b, f.full, "full", "2027-07-01", "2027-01-01");
    assert.equal(
      rows.reduce((s, r) => s + r.amount, 0),
      f.full,
    );
    const processing = rows.reduce(
      (s, r) => s + Math.ceil((r.amount * b.processingBps) / 10000) + b.processingFixed,
      0,
    );
    assert.ok(f.full - processing >= f.fullNet);
    const recognition = membershipRecognition(f.member, b.start, b.end, "2026-12-01");
    assert.equal(recognition.deferred, 105000);
  }
});
