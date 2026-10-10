import {
  facilityMonthly,
  monthlyTeamOverhead,
  teamSeasonOverhead,
  initialFacilityCosts,
  payrollSchema,
} from "./facility-overhead";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import {
  seedMasterMatrix,
  masterSchema,
  matchMatrix,
  budgetFromMatrix,
  allocateMonthlyBusiness,
} from "./budget-matrix";
import { getBudgetMaster, saveBudgetMaster, initializeTeamBudget } from "./budget-matrix.server";
import { calculateFees, project } from "./fee-model";
import { mutateFeePlan, feeWorkspace } from "./fee.server";
import { saveTeamActivity } from "./activity.server";
import { seasonEntryCosts } from "./travel-budget";

test("matrix matches sport, age and unambiguous season; detailed rows produce rounded cost floors", () => {
  const m = masterSchema.parse(seedMasterMatrix());
  assert.equal(m.rows.length, 120);
  const t = {
    ...sampleClub().teams[0],
    sport: "softball" as const,
    age: "14U",
    seasons: ["Spring 2027", "Summer 2027"],
    seasonLabel: "Spring + Summer 2027",
  };
  const r = matchMatrix(t, m)!;
  assert.equal(r.head, 390000);
  assert.equal(r.assistant, 195000);
  assert.equal(r.organization, 55000);
  assert.equal(r.balls, 62500);
  const b = budgetFromMatrix(t, m, r);
  const f = calculateFees(b);
  assert.equal(f.full, 275000);
  assert.equal(f.fullProcessing, 0);
  assert.ok(f.fullRounding > 0);
  assert.equal(
    project(b, 10, 0).beforeOverhead,
    10 * (f.member + b.fullOrg + f.fullRounding) + 10 * f.allocation - f.protectedBudget,
  );
  assert.equal(calculateFees({ ...b, headPremiumBps: 1000 }).fixed - f.fixed, 39000);
  const card = calculateFees({ ...b, processingBps: 300, processingFixed: 30 });
  assert.equal(card.full % 2500, 0);
  assert.ok(card.full - card.fullProcessing >= card.fullNet);
  assert.equal(project(b, 11, 0).full, project(b, 10, 0).full);
  for (const [age, expected] of [
    ["12U", 245000],
    ["17U", 307500],
  ] as const) {
    const team = { ...t, age };
    assert.equal(calculateFees(budgetFromMatrix(team, m, matchMatrix(team, m)!)).full, expected);
  }
  for (const patch of [
    { age: "5U" },
    { seasons: ["Spring 2027", "Fall 2027"] },
    { seasons: ["Spring 2027", "Summer 2028"] },
    { seasons: ["Spring 2027", "Spring 2028"] },
  ])
    assert.equal(matchMatrix({ ...t, ...patch }, m), null);
  const invalid = structuredClone(m);
  invalid.rows[1] = invalid.rows[0];
  assert.equal(masterSchema.safeParse(invalid).success, false);
  assert.equal(
    seasonEntryCosts(
      [],
      { ...b, start: "2027-01-01", end: "2027-12-31" },
      [
        { id: "x", org: "League", start: "2027-04-01", fee: 500 },
        { id: "y", org: "Team schedule", start: "2027-04-01", fee: 500 },
      ],
      ["x", "y"],
    ),
    50000,
  );
});
test("monthly overhead allocated once with reserve cap, post-target rate and no negative payouts", () => {
  const m = seedMasterMatrix();
  const teams = [
    { id: "a", name: "A", players: 10, contribution: 1000000 },
    { id: "b", name: "B", players: 11, contribution: 1000000 },
  ];
  const report = allocateMonthlyBusiness(m, teams);
  assert.equal(
    report.rows.reduce((n, r) => n + r.overhead, 0),
    800000,
  );
  assert.equal(report.reserve, 200000);
  assert.equal(report.distributable, 1000000);
  assert.equal(allocateMonthlyBusiness({ ...m, reserveBalance: 2399999 }, teams).reserve, 1);
  assert.equal(allocateMonthlyBusiness({ ...m, reserveBalance: 2400000 }, teams).reserve, 100000);
  const empty = allocateMonthlyBusiness(m, []);
  assert.equal(empty.unallocatedOverhead, 800000);
  assert.equal(empty.distributable, 0);
  assert.equal(empty.reserve, 0);
});
test("master admin permissions, durable revisions, draft initialization, review gates and schedule totals", async () => {
  const db = new PGlite();
  const wrap = (q: PGlite["query"]): Sql => {
    const s = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await q(
          p.reduce((s, x, i) => s + (i ? "$" + i : "") + x, ""),
          v,
        )
      ).rows) as Sql;
    s.query = (async (t: string, v: unknown[] = []) => (await q(t, v)).rows) as Sql["query"];
    s.transaction = (fn) => db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return s;
  };
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const id of ["admin", "coach", "parent"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role) values(${id},${id + "@example.invalid"},${id},${id})`;
    }
    await sql`insert into owner_grants(email,user_id) values('admin@example.invalid','admin')`;
    const club = sampleClub();
    club._demo = false;
    club.teams = club.teams.slice(0, 1);
    const t = club.teams[0];
    Object.assign(t, {
      sport: "softball",
      age: "14U",
      seasons: ["Spring 2027", "Summer 2027"],
      seasonStart: "2027-01-01",
      seasonEnd: "2027-12-31",
      coachEmail: "coach@example.invalid",
      staff: [],
      closed: false,
      tournamentIds: [],
      roster: [],
    });
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,0,false)`;
    let master = await getBudgetMaster(sql, "admin");
    assert.deepEqual(master.value, seedMasterMatrix());
    for (const id of ["coach", "parent"]) {
      await assert.rejects(() => getBudgetMaster(sql, id), /Admin/);
      await assert.rejects(() => saveBudgetMaster(sql, id, 1, master.value), /Admin/);
    }
    const plan = await initializeTeamBudget(sql, t);
    assert.equal(plan?.defaults?.revision, 1);
    assert.equal(plan?.budget.months, 6);
    master.value.hotelNightly = 30000;
    await saveBudgetMaster(sql, "admin", master.revision, master.value);
    await assert.rejects(
      () => saveBudgetMaster(sql, "admin", master.revision, master.value),
      /changed/,
    );
    await initializeTeamBudget(sql, t);
    let p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(p.budget.hotelNightly, 20000, "existing plan preserved");
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "coach", {
          action: "applyDefaults",
          teamId: t.id,
          revision: 0,
          key: "softball:14:springSummer",
          confirmed: true,
        }),
      /Admin/,
    );
    await mutateFeePlan(sql, "admin", {
      action: "applyDefaults",
      teamId: t.id,
      revision: 0,
      key: "softball:14:springSummer",
      confirmed: true,
    });
    p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(p.defaults?.revision, 2);
    assert.equal(p.budget.hotelNightly, 30000);
    // Set valid dates/policy first so the publish rejection isolates matrix readiness.
    await mutateFeePlan(sql, "admin", {
      action: "save",
      teamId: t.id,
      revision: p.revision,
      budget: {
        ...p.budget,
        secondDue: "2098-02-01",
        deadlineOverride: "2098-03-01",
        policy: "Approved payment policy",
        reinstatement: "Contact office",
      },
      uniforms: [],
      expenses: [],
    });
    p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "admin", {
          action: "publish",
          teamId: t.id,
          revision: p.revision,
          confirmed: true,
        }),
      /review/,
    );
    const event = {
      id: "",
      teamId: t.id,
      revision: 0,
      kind: "tournament" as const,
      title: "Travel event",
      date: "2027-04-01",
      startTime: "08:00",
      endTime: "18:00",
      location: "Away field",
      status: "scheduled" as const,
      ourRuns: 0,
      oppRuns: 0,
      stats: [],
      travel: "travel" as const,
      overnightNights: 2,
      entryFee: 60000,
    };
    await saveTeamActivity(sql, "coach", event);
    p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(p.budget.tournament, 60000);
    assert.equal(p.budget.hotelNights, 2);
    assert.equal(p.budget.readiness?.schedule, false);
    await mutateFeePlan(sql, "admin", {
      action: "save",
      teamId: t.id,
      revision: p.revision,
      budget: {
        ...p.budget,
        readiness: {
          schedule: true,
          gas: true,
          hotels: true,
          other: true,
          processing: true,
          noUniform: true,
        },
      },
      uniforms: [],
      expenses: [],
    });
    p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    await mutateFeePlan(sql, "admin", {
      action: "publish",
      teamId: t.id,
      revision: p.revision,
      confirmed: true,
    });
    p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(p.status, "published");
    await assert.rejects(
      () =>
        mutateFeePlan(sql, "admin", {
          action: "applyDefaults",
          teamId: t.id,
          revision: p.revision,
          key: "softball:14:springSummer",
          confirmed: true,
        }),
      /unpublished/,
    );
    const staffMaster = await getBudgetMaster(sql, "admin");
    assert.ok(staffMaster.people.some((x) => x.userId === "parent"));
    const staffing = {
      ...staffMaster.value,
      facilityCosts: initialFacilityCosts(800000),
      payroll: [{ userId: "coach", name: "Forged name", monthly: 200000, active: true }],
      overheadRule: { mode: "percent" as const, bps: 1000 },
    };
    await saveBudgetMaster(sql, "admin", staffMaster.revision, staffing);
    const savedMaster = await getBudgetMaster(sql, "admin");
    assert.equal(savedMaster.value.monthlyOverhead, 1000000);
    assert.equal(savedMaster.value.payroll![0].name, "coach");
    p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(p.budget.overhead, 600000);
    const publishedFee = p.published!.full;
    await mutateFeePlan(sql, "admin", {
      action: "save",
      teamId: t.id,
      revision: p.revision,
      budget: { ...p.budget, overheadRule: { mode: "fixed", monthly: 50000 } },
      uniforms: [],
      expenses: [],
    });
    p = (await feeWorkspace(sql, "admin")).teams[0].private!.plan;
    assert.equal(p.budget.overhead, 300000);
    assert.equal(p.published!.full, publishedFee);
    await saveBudgetMaster(sql, "admin", savedMaster.revision, {
      ...savedMaster.value,
      overheadRule: { mode: "percent", bps: 2000 },
    });
    assert.equal((await feeWorkspace(sql, "admin")).teams[0].private!.plan.budget.overhead, 300000);
    const latest = await getBudgetMaster(sql, "admin");
    await assert.rejects(
      () =>
        saveBudgetMaster(sql, "admin", latest.revision, {
          ...latest.value,
          payroll: [{ userId: "unknown", name: "Unknown", monthly: 10, active: true }],
        }),
      /existing account/,
    );
  } finally {
    await db.close();
  }
});

test("facility costs, payroll and team overrides reconcile monthly and partial-season overhead", () => {
  const master = {
    ...seedMasterMatrix(),
    facilityCosts: initialFacilityCosts(800000),
    payroll: [
      { userId: "coach", name: "Coach", monthly: 200000, active: true },
      { userId: "parent", name: "Parent", monthly: 100000, active: false },
    ],
    overheadRule: { mode: "percent" as const, bps: 1000 },
  };
  assert.equal(facilityMonthly(master), 1000000);
  assert.equal(monthlyTeamOverhead(master), 100000);
  assert.equal(teamSeasonOverhead({ months: 2.5, overhead: 0 }, master).overhead, 250000);
  assert.equal(
    teamSeasonOverhead(
      { months: 6, overhead: 0, overheadRule: { mode: "fixed" as const, monthly: 50000 } },
      master,
    ).overhead,
    300000,
  );
  assert.equal(monthlyTeamOverhead(master, { mode: "percent", bps: 2000 }), 200000);
  assert.equal(monthlyTeamOverhead(master, { mode: "fixed", monthly: 0 }), 0);
  const report = allocateMonthlyBusiness(master, [
    { id: "one", name: "One", players: 10, contribution: 2000000 },
    {
      id: "two",
      name: "Two",
      players: 10,
      contribution: 2000000,
      overheadRule: { mode: "fixed", monthly: 50000 },
    },
  ]);
  assert.equal(report.rows[0].overhead, 100000);
  assert.equal(report.rows[1].overhead, 50000);
  assert.equal(report.unallocatedOverhead, 850000);
  assert.equal(report.overhead, 1000000);
  const over = allocateMonthlyBusiness(master, [
    {
      id: "one",
      name: "One",
      players: 10,
      contribution: 2000000,
      overheadRule: { mode: "fixed", monthly: 1500000 },
    },
  ]);
  assert.equal(over.overallocatedOverhead, 500000);
  assert.equal(over.unallocatedOverhead, 0);
  assert.equal(payrollSchema.safeParse([master.payroll[0], master.payroll[0]]).success, false);
});
