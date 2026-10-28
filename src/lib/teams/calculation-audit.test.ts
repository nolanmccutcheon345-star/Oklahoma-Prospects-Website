import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBudget,
  calculateFees,
  feeComposition,
  feeCostTrace,
  project,
  businessProjection,
  installments,
  membershipRecognition,
  budgetForRoster,
} from "./fee-model";
import { seedMasterMatrix, budgetFromMatrix } from "./budget-matrix";
import { sampleClub } from "./seed";

test("itemized estimates reconcile to the proposed player fee, survive saving, and honor explicit zero", () => {
  const b = {
    ...defaultBudget(),
    start: "2027-05-25",
    end: "2027-07-30",
    baseline: 10,
    costs: [{ id: "synthetic-operations", name: "Synthetic team expenses", cents: 470500 }],
    tournament: 990000,
    uniformCost: 99000,
    tournamentEstimate: 775000,
    uniformEstimate: 25000,
    fullIncremental: 0,
    hotelNightly: 0,
    hotelNights: 0,
    membershipMonthly: 15000,
    fullOrg: 35000,
    contingencyBps: 1500,
    roundTo: 2500,
    processingBps: 0,
    processingFixed: 0,
  };
  const c = feeComposition(b, "full"),
    trace = feeCostTrace(b);
  assert.deepEqual(
    [c.teamCosts, c.contingency, c.membership, c.organization, c.processing, c.adjustment, c.total],
    [149550, 29183, 45000, 35000, 0, 1267, 260000],
  );
  assert.deepEqual(
    [trace.tournament, trace.uniformEach, trace.uniforms, trace.direct, trace.protectedBudget],
    [775000, 25000, 250000, 1945500, 2237325],
  );
  assert.deepEqual(feeComposition(JSON.parse(JSON.stringify(b)), "full"), c);
  assert.equal(feeCostTrace({ ...b, tournamentEstimate: 0, uniformEstimate: 0 }).direct, 920500);
  assert.equal(
    feeCostTrace({ ...b, tournamentEstimate: undefined, uniformEstimate: undefined }).direct,
    2900500,
  );
});

test("all 120 master rows reconcile across roster sizes, PO counts, processing without bundled memberships", () => {
  const m = seedMasterMatrix();
  assert.equal(m.rows.length, 120);
  for (const row of m.rows) {
    const b = {
      ...budgetFromMatrix(sampleClub().teams[0], m, row),
      start: "2028-02-29",
      end: "2028-04-01",
      uniformEstimate: 12345,
      tournamentEstimate: 456789,
      hotelNights: 3,
      hotelNightly: 20000,
      fullIncremental: 321,
      headPremiumBps: 137,
      assistantPremiumBps: 219,
    };
    const fixed =
      b.costs.reduce(
        (n, c) =>
          n +
          c.cents +
          Math.ceil(
            (c.cents * (c.id === "matrix-head" ? 137 : c.id === "matrix-assistant" ? 219 : 0)) /
              10000,
          ),
        0,
      ) +
      456789 +
      60000;
    const direct = fixed + b.baseline * (12345 + 321 + 3 * b.membershipMonthly);
    for (const processingBps of [0, 290]) {
      const budget = { ...b, processingBps, processingFixed: processingBps ? 30 : 0 };
      const f = calculateFees(budget);
      assert.equal(f.fixed, fixed);
      assert.equal(f.direct, direct);
      assert.equal(f.contingency, Math.ceil((direct * b.contingencyBps) / 10000));
      assert.equal(f.member, 3 * b.membershipMonthly);
      assert.equal(
        installments(f.full).reduce((a, n) => a + n, 0),
        f.full,
      );
      for (const role of ["full", "po"] as const) {
        const c = feeComposition(budget, role);
        assert.equal(
          c.teamCosts + c.contingency + c.membership + c.organization + c.processing + c.adjustment,
          c.total,
        );
      }
      for (const full of [0, 8, 9, 10, 11, 12])
        for (const po of [0, 1, 3]) {
          const p = project(budget, full, po);
          assert.equal(p.externalDirect, fixed + (full + po) * (12345 + 321));
          assert.equal(
            p.programDirect,
            full * 3 * b.membershipMonthly + po * 3 * b.poMembershipMonthly!,
          );
          assert.equal(p.direct, p.externalDirect + p.programDirect);
          assert.equal(p.totalRevenue, full * f.full + po * f.po);
          assert.equal(p.teamOperatingRevenue + p.organizationAndProgramRevenue, p.totalRevenue);
          assert.equal(
            p.beforeOverhead,
            p.totalRevenue - p.externalDirect - p.processing - p.serviceCosts - p.reserve,
          );
          assert.equal(p.nolan + p.steve, p.distributable);
          assert.ok(Number.isSafeInteger(p.beforeOverhead));
        }
    }
  }
});

test("contingency expenses, season close and organization splits reconcile without double-counting", () => {
  const b = { ...defaultBudget(), start: "2027-01-01", end: "2027-01-31" };
  const base = project(b, 10, 0);
  for (const used of [0, 1, base.reserve, base.reserve + 101]) {
    const expenses = [
      {
        id: "expense",
        name: "Synthetic expense",
        cents: used,
        contingency: true,
        paid: true,
        date: "2027-01-15",
      },
    ];
    const open = project(b, 10, 0, expenses),
      closed = project(b, 10, 0, expenses, true);
    assert.equal(open.beforeOverhead, base.beforeOverhead - Math.max(0, used - base.reserve));
    assert.equal(closed.beforeOverhead, base.beforeOverhead + base.reserve - used);
    const organization = businessProjection([open, closed], 12345, 6789, 3333);
    assert.equal(organization.nolan + organization.steve, organization.distributable);
  }
  for (const date of ["2026-12-31", "2027-01-01", "2027-01-16", "2027-01-31", "2027-02-01"]) {
    const r = membershipRecognition(10001, b.start, b.end, date);
    assert.equal(r.earned + r.deferred, 10001);
  }
});

test("actual roster reports cannot transfer a removed player's incremental cost to another player", () => {
  const b = {
    ...defaultBudget(),
    baseline: 1,
    additionalPlayerCosts: [
      { playerId: "removed", insurance: 9999, registration: 0, other: 0 },
      { playerId: "po", insurance: 1234, registration: 50, other: 0 },
    ],
  };
  const roster = [
    { id: "base", roleType: "full" as const },
    { id: "extra", roleType: "full" as const },
    { id: "po", roleType: "po" as const },
  ];
  assert.equal(project(budgetForRoster(b, roster), 2, 1).incrementalSurcharges, 1284);
  assert.equal(b.additionalPlayerCosts.length, 2);
});
