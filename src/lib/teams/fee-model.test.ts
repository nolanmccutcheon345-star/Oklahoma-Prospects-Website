import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultBudget,
  calculateFees,
  project,
  installments,
  paymentStatus,
  membershipRecognition,
  businessProjection,
  deadline,
} from "./fee-model";
const fixture = () => ({
  ...defaultBudget(),
  start: "2027-04-01",
  end: "2027-06-15",
  months: 2.5,
  fullOrg: 40000,
  poOrg: 20000,
  uniformCost: 15000,
  fullIncremental: 2000,
  poIncremental: 1000,
  poSharedAllocation: 10000,
  tournament: 300000,
  costs: [{ id: "coach", name: "Coach", cents: 200000 }],
  overhead: 100000,
  reserve: 50000,
  serviceCostMonthly: 1000,
});
for (const [full, po] of [
  [10, 0],
  [10, 1],
  [10, 2],
  [11, 0],
  [11, 1],
  [12, 0],
  [8, 0],
  [9, 0],
])
  test(`${full} full players + ${po} PO: every dollar reconciles`, () => {
    const b = fixture(),
      r = project(b, full, po),
      fees = calculateFees(b);
    assert.equal(fees.direct, 670000);
    assert.equal(fees.contingency, 100500);
    assert.equal(fees.member, 50000);
    assert.equal(fees.full, 167050);
    assert.equal(r.totalRevenue, full * fees.full + po * fees.po);
    assert.equal(
      r.totalRevenue,
      r.direct + r.reserve + r.processing + r.serviceCosts + r.contribution,
    );
    assert.equal(r.net, r.contribution - b.overhead);
    assert.equal(r.nolan + r.steve, r.distributable);
    assert.equal(r.membership, (full + po) * 50000);
    assert.equal(r.organization, full * 40000 + po * 20000);
    assert.equal(r.extraContribution, r.extraRevenue - r.extraCosts - po * fees.poContingency);
    assert.equal(
      installments(fees.full).reduce((a, n) => a + n, 0),
      fees.full,
    );
    if (full === 10 && po === 0) assert.equal(r.contribution, 10 * (50000 + 40000 - 2500));
    if (full < 10) assert.ok(r.baselineShortfall > 0);
    else assert.equal(r.baselineShortfall, 0);
  });
test("adding a player does not reduce original fees or count their entire revenue as profit", () => {
  const b = fixture(),
    a = project(b, 10, 0),
    c = project(b, 11, 0);
  assert.equal(a.full, c.full);
  assert.equal(c.contribution - a.contribution, c.extraContribution);
  assert.ok(c.extraContribution < c.extraRevenue);
});
for (const field of ["uniform", "tournament", "coach"] as const)
  test(`${field} cost increase is funded with contingency at baseline`, () => {
    const b = fixture(),
      before = calculateFees(b);
    if (field === "uniform") b.uniformCost += 1000;
    if (field === "tournament") b.tournament += 10000;
    if (field === "coach") b.costs[0].cents += 10000;
    const after = calculateFees(b);
    assert.equal(after.direct - before.direct, 10000);
    assert.equal(after.contingency - before.contingency, 1500);
    assert.equal(after.full - before.full, 1150);
  });
for (const used of [0, 100500, 150500])
  test(`contingency consumption ${used} remains separate until close`, () => {
    const b = fixture(),
      expenses = [
        {
          id: "x",
          name: "Unexpected",
          cents: used,
          contingency: true,
          paid: true,
          date: "2027-06-01",
        },
      ];
    const active = project(b, 10, 0, expenses),
      closed = project(b, 10, 0, expenses, true);
    assert.equal(active.reserve, 100500);
    assert.equal(active.remaining, Math.max(0, 100500 - used));
    assert.equal(closed.beforeOverhead - active.beforeOverhead, active.remaining);
    assert.equal(active.unexpected, Math.max(0, used - 100500));
  });
test("40/30/30 cents reconcile for every small amount and large boundary", () => {
  for (let cents = 0; cents < 100000; cents++) {
    const [a, b, c] = installments(cents);
    assert.equal(a + b + c, cents);
    assert.ok(c >= 0);
  }
  assert.equal(
    installments(99999999).reduce((a, n) => a + n, 0),
    99999999,
  );
});
test("processing gross-up covers all three rounded transactions", () => {
  const b = { ...fixture(), processingBps: 290, processingFixed: 30 };
  const f = calculateFees(b);
  for (const [fee, net] of [
    [f.full, f.fullNet],
    [f.po, f.poNet],
  ])
    assert.ok(fee - installments(fee).reduce((s, n) => s + Math.ceil(n * 0.029) + 30, 0) >= net);
});
test("partial-month membership earns over service dates, not collection date", () => {
  const b = fixture(),
    f = calculateFees(b);
  assert.equal(f.member, 50000);
  assert.deepEqual(membershipRecognition(f.member, b.start, b.end, "2027-03-01"), {
    earned: 0,
    deferred: 50000,
  });
  assert.deepEqual(membershipRecognition(f.member, b.start, b.end, b.end), {
    earned: 50000,
    deferred: 0,
  });
  const mid = membershipRecognition(f.member, b.start, b.end, "2027-05-01");
  assert.equal(mid.earned + mid.deferred, 50000);
  assert.ok(mid.earned > 0 && mid.deferred > 0);
});
test("early full payment satisfies all installments; partial deposit does not release uniform", () => {
  const b = fixture(),
    total = calculateFees(b).full;
  let r = paymentStatus(total, total, "2027-01-01", "2027-02-01", "2027-03-01", "2027-01-01", b);
  assert.equal(r.status, "Paid in Full");
  assert.ok(r.rows.every((r) => r.remaining === 0));
  assert.equal(r.uniformReady, true);
  r = paymentStatus(total, 1, "2027-01-01", "2027-02-01", "2027-03-01", "2027-01-01", b);
  assert.equal(r.depositPaid, false);
  assert.equal(r.uniformReady, false);
});
test("missed deposit, late, grace, at-risk, held and removed statuses do not auto-remove", () => {
  const b = fixture(),
    total = calculateFees(b).full;
  const status = (date: string, roster = "Confirmed") =>
    paymentStatus(total, 0, "2027-01-01", "2027-02-01", "2027-03-01", date, b, roster);
  assert.equal(status("2027-01-01").status, "Payment Due");
  assert.equal(status("2027-01-02").status, "Grace Period");
  assert.equal(status("2027-01-10").status, "Past Due");
  assert.equal(status("2027-01-23").status, "At Risk");
  assert.equal(status("2027-02-20").removalEligible, true);
  assert.equal(status("2027-02-20").status, "At Risk");
  assert.equal(status("2027-02-20", "Roster Hold").status, "Roster Hold");
  assert.equal(status("2027-02-20", "Removed").status, "Removed");
});
test("removed player leaves a funding downside, not a redistributed cheaper fee", () => {
  const b = fixture(),
    before = project(b, 10, 0),
    after = project(b, 9, 0);
  assert.equal(after.full, before.full);
  assert.ok(after.net < before.net);
  assert.ok(after.baselineShortfall > 0);
});
test("designated schedule event sets deadline 28 days before, admin override is explicit", () => {
  const b = { ...fixture(), triggerEventId: "event" };
  assert.equal(
    deadline(b, [
      { id: "other", start: "2027-03-01" },
      { id: "event", start: "2027-04-01" },
    ]),
    "2027-03-04",
  );
  assert.equal(deadline({ ...b, deadlineOverride: "2027-03-02" }, []), "2027-03-02");
});
test("1–5 business scenarios count fixed overhead once and never distribute a loss", () => {
  const t = project(fixture(), 10, 0);
  for (let n = 1; n <= 5; n++) {
    const r = businessProjection(Array(n).fill(t), 2000000, 100000);
    assert.equal(r.net, n * t.beforeOverhead - 2000000);
    assert.equal(r.distributable, Math.max(0, r.net - 100000));
    assert.equal(r.nolan + r.steve, r.distributable);
  }
});

test("custom schedules: arbitrary counts, dollar amounts, PO amounts, cent rounding and first tournament deadline", async () => {
  const { scheduleRows } = await import("./fee-model");
  const b = {
    ...fixture(),
    daysBeforeTournament: 14,
    paymentSchedule: {
      mode: "percent" as const,
      rows: [
        { full: 2500, po: 1000, due: "" },
        { full: 2500, po: 2000, due: "2027-01-10" },
        { full: 2500, po: 3000, due: "2027-02-10" },
        { full: 2500, po: 4000, due: "" },
      ],
    },
  };
  const rows = scheduleRows(b, 10001, "full", "2027-03-01", "2026-12-01");
  assert.equal(rows.length, 4);
  assert.equal(rows[0].amount, 2500);
  assert.equal(rows[3].amount, 2501);
  assert.equal(
    rows.reduce((n, r) => n + r.amount, 0),
    10001,
  );
  assert.equal(scheduleRows(b, 10000, "po", "2027-03-01")[0].amount, 1000);
  assert.equal(
    deadline(b, [
      { id: "later", start: "2027-04-02" },
      { id: "first", start: "2027-03-20" },
    ]),
    "2027-03-06",
  );
  const dollars = {
    ...b,
    paymentSchedule: {
      mode: "amount" as const,
      rows: [
        { full: 1000, po: 500, due: "" },
        { full: 9001, po: 7500, due: "" },
      ],
    },
  };
  assert.deepEqual(
    scheduleRows(dollars, 10001, "full", "2027-03-01").map((r) => r.amount),
    [1000, 9001],
  );
  assert.throws(() => scheduleRows(dollars, 10000, "full", "2027-03-01"), /add up/);
  assert.throws(
    () =>
      scheduleRows(
        {
          ...b,
          paymentSchedule: { ...b.paymentSchedule, rows: b.paymentSchedule.rows.slice(0, 2) },
        },
        10000,
        "full",
        "2027-03-01",
      ),
    /100%/,
  );
  const many = {
    ...b,
    processingFixed: 30,
    processingBps: 300,
    paymentSchedule: {
      mode: "percent" as const,
      rows: Array.from({ length: 13 }, (_, i) => ({
        full: i === 12 ? 772 : 769,
        po: i === 12 ? 772 : 769,
        due: "",
      })),
    },
  };
  const fees = calculateFees(many),
    payments = scheduleRows(many, fees.full, "full", "2027-03-01");
  assert.ok(
    fees.full - payments.reduce((n, r) => n + Math.ceil(r.amount * 0.03) + 30, 0) >= fees.fullNet,
  );
});
