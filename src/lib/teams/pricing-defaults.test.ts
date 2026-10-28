import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { seedMasterMatrix, budgetFromMatrix, rowKey } from "./budget-matrix";
import {
  releasedMaster,
  linkedPricingDraft,
  patchPricingDraft,
  teamPricingValues,
} from "./pricing-defaults";
import {
  defaultBudget,
  calculateFees,
  deadline,
  scheduleRows,
  paymentReviewKey,
} from "./fee-model";
import { feeHealth } from "./fee-health";
import { sampleClub } from "./seed";
import type { FeePlan } from "./fee-contracts";
import type { Sql } from "../db";
import { getBudgetMaster, saveBudgetMaster, initializeTeamBudget } from "./budget-matrix.server";
import { feeWorkspace, mutateFeePlan } from "./fee.server";
const release = JSON.parse(
  (await readFile("migrations/0099_team_pricing_defaults.sql", "utf8")).match(
    /VALUES \(1,'(.*?)'::jsonb/s,
  )![1],
);
const master = () => releasedMaster(seedMasterMatrix(), release);
const team = () => ({
  ...sampleClub().teams[0],
  sport: "baseball" as const,
  age: "13U",
  seasonLabel: "Spring 2027",
  seasons: ["Spring 2027"],
  seasonStart: "2027-03-01",
  seasonEnd: "2027-05-31",
  closed: false,
});
const plan = (budget = defaultBudget()): FeePlan => ({
  budget,
  uniforms: [],
  status: "draft",
  revision: 0,
  expenses: [],
  players: {},
  history: [],
});

test("release data supplies editable defaults for every matrix row without changing cost bases", () => {
  const old = seedMasterMatrix(),
    m = master();
  assert.deepEqual(m.rows, old.rows);
  for (const row of m.rows)
    for (const dates of [
      ["2027-03-01", "2027-05-31", 3],
      ["2028-02-29", "2028-02-29", 1],
      ["2027-12-31", "2028-01-01", 2],
    ] as const) {
      const b = budgetFromMatrix({ ...team(), seasonStart: dates[0], seasonEnd: dates[1] }, m, row);
      const f = calculateFees(b);
      assert.equal(b.membershipMonthly, 8000);
      assert.equal(b.poMembershipMonthly, 8000);
      assert.equal(b.contingencyBps, 1250);
      assert.equal(b.months, dates[2]);
      assert.equal(f.member, 8000 * dates[2]);
      assert.equal(f.poMember, f.member);
      assert.equal(f.contingency, Math.ceil(f.direct * 0.125));
      assert.equal(
        calculateFees({ ...b, membershipMonthly: 9000 }).contingency,
        Math.ceil((f.direct + b.baseline * 1000 * dates[2]) * 0.125),
      );
      const rows = scheduleRows(b, f.full, "full", "2027-01-18");
      assert.equal(
        rows.reduce((s, r) => s + r.amount, 0),
        f.full,
      );
    }
  const changed = { ...m, membershipMonthly: 9200, contingencyBps: 1000 };
  assert.deepEqual(
    releasedMaster(changed, release),
    changed,
    "saved owner configuration wins over release seeds",
  );
});

test("known inherited drafts follow masters while team overrides, row overrides and historical snapshots survive", () => {
  const old = seedMasterMatrix(),
    row = old.rows.find((r) => rowKey(r) === "baseball:13:spring")!;
  const p = {
    ...plan(budgetFromMatrix(team(), old, row)),
    defaults: { key: rowKey(row), revision: 1, appliedAt: "2026-01-01" },
  };
  const original = structuredClone(p);
  let b = linkedPricingDraft(p, master(), team());
  assert.equal(b.membershipMonthly, 8000);
  assert.equal(b.contingencyBps, 1250);
  assert.deepEqual(p, original);
  b = patchPricingDraft(b, { membershipMonthly: 8000, contingencyBps: 0 });
  const next = { ...master(), membershipMonthly: 9000, contingencyBps: 2000 };
  b = linkedPricingDraft({ ...p, budget: b }, next, team());
  assert.equal(b.membershipMonthly, 8000, "same-value explicit override remains explicit");
  assert.equal(b.contingencyBps, 0, "zero override survives");
  b = linkedPricingDraft(
    { ...p, budget: { ...b, pricingInheritance: { version: 1, overrides: [] } } },
    next,
    team(),
  );
  assert.equal(b.membershipMonthly, 9000);
  const m = master();
  m.rows.find((r) => rowKey(r) === rowKey(row))!.membershipMonthly = 12345;
  assert.equal(linkedPricingDraft({ ...p, budget: b }, m, team()).membershipMonthly, 12345);
  assert.deepEqual(linkedPricingDraft({ ...p, status: "closed" }, m, team()), p.budget);
  assert.equal(
    linkedPricingDraft(plan(), m, team()).membershipMonthly,
    15000,
    "unproven legacy values retained for owner review",
  );
  assert.equal(linkedPricingDraft(plan(), m, team()).pricingInheritance!.legacyReview, true);
  const { age, sport, seasonLabel, seasons } = team();
  assert.equal(
    teamPricingValues(m, plan(), { age, sport, seasonLabel, seasons }).membershipMonthly,
    12345,
    "legacy reset preview uses the same applicable matrix row as the server",
  );
});

test("event schedules use exact cents, Chicago calendar dates, leap days and fixed acceptance dates", () => {
  const b = {
    ...defaultBudget(),
    start: "2027-01-01",
    end: "2027-06-30",
    eventPaymentSchedule: release.eventPaymentSchedule,
  };
  const final = deadline(b, [{ id: "event", start: "2027-04-01T01:00:00Z" }]);
  assert.equal(final, "2027-02-17", "event is March 31 in Chicago");
  const rows = scheduleRows(b, 252500, "full", final, "2027-02-01");
  assert.deepEqual(
    rows.map((r) => r.amount),
    [176750, 37875, 37875],
  );
  assert.deepEqual(
    rows.map((r) => r.due),
    ["2026-12-23", "2027-01-20", "2027-02-17"],
  );
  for (const amount of [0, 1, 2, 3, 5, 19, 101, 252501, 1000000000]) {
    const values: number[] = scheduleRows(b, amount, "po", final).map((r) => r.amount);
    assert.equal(
      values.reduce((a, v) => a + v, 0),
      amount,
    );
    assert.ok(values.every((n) => Number.isSafeInteger(n) && n >= 0));
  }
  assert.equal(deadline(b, []), "");
  assert.equal(deadline({ ...b, start: "" }, [{ id: "e", start: "2027-04-01" }]), "");
  assert.ok(
    feeHealth(b, { finalDue: final, today: "2027-01-01" }).pending.some((p) =>
      p.includes("already past"),
    ),
  );
  const reviewed = {
    ...b,
    pastDueReview: {
      key: paymentReviewKey(b, final),
      reason: "Owner reviewed the late enrollment schedule.",
    },
  };
  assert.ok(
    !feeHealth(reviewed, { finalDue: final, today: "2027-01-01" }).pending.some((p) =>
      p.includes("already past"),
    ),
  );
  assert.ok(
    feeHealth(reviewed, { finalDue: "2027-02-18", today: "2027-01-01" }).pending.some((p) =>
      p.includes("already past"),
    ),
  );
  assert.equal(
    deadline({ ...b, start: "2028-01-01", end: "2028-06-01" }, [{ id: "e", start: "2028-04-11" }]),
    "2028-02-29",
  );
});

test("persisted defaults propagate atomically; published offers, accepted agreements and payments stay fixed", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = (fn) =>
      db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const n of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + n, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const [id, role] of [
      ["owner", "admin"],
      ["parent", "parent"],
      ["coach", "coach"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
      await sql`insert into profiles(user_id,email,name,role) values(${id},${id + "@example.invalid"},${id},${role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    const club = sampleClub();
    club._demo = false;
    const t = team();
    t.roster = [
      {
        ...t.roster[0],
        teamId: t.id,
        roleType: "full",
        withdrawn: false,
        feeLock: null,
        planLock: null,
        payments: [],
        credits: [],
        parents: [{ name: "Parent", rel: "parent", phone: "", email: "parent@example.invalid" }],
        agreement: { version: "", signedBy: "", signedAt: "" },
      },
    ];
    t.tournamentIds = ["event"];
    club.teams = [t];
    club.catalog = [
      {
        ...club.catalog[0],
        id: "event",
        org: "Fixture",
        start: "2027-04-01",
        end: "2027-04-01",
        fee: 0,
      },
    ];
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    await initializeTeamBudget(sql, t);
    let m = await getBudgetMaster(sql, "owner");
    assert.equal(m.value.membershipMonthly, 8000);
    await assert.rejects(() => saveBudgetMaster(sql, "coach", m.revision, m.value), /Admin/);
    const read = async () => (await feeWorkspace(sql, "owner")).teams[0];
    let v = await read();
    assert.equal(v.private!.plan.budget.contingencyBps, 1250);
    assert.equal(v.events[0].start, "2027-04-01");
    let b = {
      ...v.private!.plan.budget,
      tournamentEstimate: 0,
      uniformEstimate: 0,
      policy: "Synthetic approved policy",
      parentExplanation: {
        initialDeposit: "Synthetic initial deposit coverage.",
        monthlyDues: "Synthetic scheduled facility and program access.",
        teamExpenses: "Team separately arranges tournament expenses.",
        additionalNotes: "",
      },
      reinstatement: "Owner review required",
      processingZeroReason: "Synthetic fee-free fixture",
      readiness: {
        schedule: true,
        gas: true,
        hotels: true,
        other: true,
        processing: true,
        noUniform: true,
      },
    };
    await mutateFeePlan(sql, "owner", {
      action: "save",
      teamId: t.id,
      revision: v.revision,
      budget: b,
      uniforms: [],
      expenses: [],
    });
    m = await getBudgetMaster(sql, "owner");
    await saveBudgetMaster(sql, "owner", m.revision, { ...m.value, overheadReviewed: true });
    v = await read();
    await mutateFeePlan(sql, "owner", {
      action: "publish",
      teamId: t.id,
      revision: v.revision,
      confirmed: true,
    });
    v = await read();
    const published = structuredClone(v.publication),
      publishedBudget = structuredClone(v.private!.plan.publishedBudget);
    assert.equal(published!.schedules!.full[0].due, "2026-12-24");
    club.catalog[0].start = "2027-04-08";
    club.catalog[0].end = "2027-04-08";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    v = await read();
    assert.equal(v.events[0].start, "2027-04-08");
    assert.equal(deadline(v.private!.plan.budget, v.events), "2027-02-25");
    assert.equal(
      v.private!.pricingRevisionNeeded,
      true,
      "event changes require publication review",
    );
    assert.deepEqual(v.publication, published, "event edits cannot amend the published schedule");
    await mutateFeePlan(sql, "parent", {
      action: "accept",
      teamId: t.id,
      playerId: t.roster[0].id,
      revision: v.revision,
      consent: true,
      name: "Synthetic Parent",
    });
    const [accepted] = await sql<{
      payload: ReturnType<typeof sampleClub>;
    }>`select payload from club_state where id='oklahoma-prospects'`;
    assert.deepEqual(
      accepted.payload.teams[0].roster[0].planLock!.rows.map((r) => r.date),
      published!.schedules!.full.map((r) => r.due),
    );
    accepted.payload.teams[0].roster[0].payments.push({
      amount: 123,
      date: "2026-10-22",
      note: "Synthetic receipt",
    } as never);
    await sql`update club_state set payload=${JSON.stringify(accepted.payload)}::jsonb where id='oklahoma-prospects'`;
    // Existing cash and agreement history must never be modified by a master edit.
    const originalClub = (
      await sql<{ payload: unknown }>`select payload from club_state where id='oklahoma-prospects'`
    )[0].payload;
    m = await getBudgetMaster(sql, "owner");
    await saveBudgetMaster(sql, "owner", m.revision, {
      ...m.value,
      membershipMonthly: 9000,
      contingencyBps: 1000,
    });
    v = await read();
    b = { ...b, ...v.private!.plan.budget };
    assert.equal(b.membershipMonthly, 9000);
    assert.equal(b.contingencyBps, 1000);
    assert.deepEqual(v.publication, published);
    assert.deepEqual(v.private!.plan.publishedBudget, publishedBudget);
    assert.equal(v.private!.pricingRevisionNeeded, true);
    assert.deepEqual(
      (
        await sql<{
          payload: unknown;
        }>`select payload from club_state where id='oklahoma-prospects'`
      )[0].payload,
      originalClub,
    );
    await mutateFeePlan(sql, "owner", {
      action: "save",
      teamId: t.id,
      revision: v.revision,
      budget: patchPricingDraft(b, { membershipMonthly: 0 }),
      uniforms: [],
      expenses: [],
    });
    m = await getBudgetMaster(sql, "owner");
    await saveBudgetMaster(sql, "owner", m.revision, { ...m.value, membershipMonthly: 11000 });
    assert.equal((await read()).private!.plan.budget.membershipMonthly, 0);
    assert.ok((await sql`select detail from club_audit where action='budget-master'`).length >= 3);
  } finally {
    await db.close();
  }
});
