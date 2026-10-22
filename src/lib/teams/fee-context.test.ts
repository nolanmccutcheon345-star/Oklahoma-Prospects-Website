import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import type { z } from "zod";
import { sampleClub } from "./seed";
import { defaultBudget } from "./fee-model";
import { feeAction, type FeePlan } from "./fee-contracts";
import {
  feeWorkspace,
  feeWorkspaceInTransaction,
  mutateFeePlan,
  setFeeBusiness,
  teamUniform,
  teamFundingStatus,
  financialEventCommitments,
  amendFinancialEventCommitment,
  admitFinancialEventCommitment,
} from "./fee.server";
import { saveOrganizationActivity } from "../coordinator/organization.server";
import { getBudgetMaster, saveBudgetMaster, initializeTeamBudget } from "./budget-matrix.server";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  addFinancialPlayerAliasForOwner,
  readFinancialBasisForOwner,
} from "../finance/basis.server";
import { withFinancialContext } from "../finance/context.server";

const db = new PGlite();
after(() => db.close());
function adapter(query: PGlite["query"], inTransaction = false): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (text: string, values: unknown[] = []) =>
    (await query(text, values)).rows) as Sql["query"];
  sql.transaction = (work) => {
    assert.equal(inTransaction, false, "Financial consumers must not nest transactions");
    return db.transaction((tx) => work(adapter(tx.query.bind(tx) as PGlite["query"], true)));
  };
  return sql;
}
function readyBudget() {
  return {
    ...defaultBudget(),
    tournamentEstimate: 10000,
    uniformEstimate: 0,
    start: "2027-04-01",
    end: "2027-06-15",
    months: 2.5,
    poEnabled: true,
    poRosterLimit: 1,
    fullOrg: 45678,
    poOrg: 20000,
    deadlineOverride: "2027-03-01",
    secondDue: "2027-02-01",
    uniformCutoff: "",
    policy: "Written policy reviewed.",
    reinstatement: "Settle outstanding balances.",
    readiness: {
      schedule: true,
      gas: true,
      hotels: true,
      other: true,
      processing: true,
      noUniform: true,
    },
    noUniformReason: "No uniform purchase required for this fixture.",
    processingZeroReason: "No processing charge in this fixture.",
  };
}
async function fixture() {
  await db.exec("drop schema public cascade; create schema public");
  for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + file, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["coach", "coach"],
    ["parent", "parent"],
    ["athlete", "player"],
    ["stranger", "parent"],
    ["operations", "admin"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner'),('operations@example.invalid','operations')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('operations','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 3;
  const seed = club.teams[0];
  club.teams = ["draft", "published", "past", "late"].map((id) => {
    const team = structuredClone(seed);
    Object.assign(team, {
      id,
      sport: "baseball",
      age: "14U",
      name: id,
      coachEmail: "coach@example.invalid",
      staff: [],
      closed: false,
      tournamentIds: [],
      seasons: ["Spring 2027"],
      seasonLabel: "Spring 2027",
      seasonStart: "2027-04-01",
      seasonEnd: "2027-06-15",
      months: 2.5,
    });
    team.roster = team.roster.slice(0, id === "past" || id === "late" ? 1 : 2).map((p, i) => ({
      ...p,
      id: id + "-" + i,
      teamId: id,
      familyId: "frozen-home",
      roleType: "full",
      withdrawn: false,
      email: i === 0 ? "athlete@example.invalid" : "",
      parents: [{ name: "Parent", rel: "parent", phone: "", email: "parent@example.invalid" }],
      feeLock: null,
      planLock: null,
      payments: [],
      credits: [],
      depositPaid: false,
      agreement: { version: "", signedBy: "", signedAt: "" },
    }));
    return team;
  });
  for (const team of club.teams) {
    const plan: FeePlan = {
      budget: readyBudget(),
      uniforms: [],
      expenses: [],
      players: {},
      history: [],
      revision: 0,
      status: "draft",
    };
    if (team.id !== "draft") {
      plan.status = "published";
      plan.published = {
        full: 100000,
        po: 75000,
        secondDue: "",
        finalDue: "2027-03-01",
        policy: "Frozen published agreement.",
        at: "2026-01-01T00:00:00Z",
        revision: 1,
      };
      // Deliberately no publishedBudget: the fee workspace synthesizes it only
      // in a detached view while other financial consumers keep it absent.
    }
    if (team.id === "past" || team.id === "late") {
      plan.budget.start = "2025-01-01";
      plan.budget.end = "2025-03-31";
      plan.budget.months = 3;
      const p = team.roster[0];
      p.agreement = { version: "historic", signedBy: "Parent", signedAt: "2025-01-01T00:00:00Z" };
      p.feeLock = {
        amount: 1000,
        lockedAt: "2025-01-01T00:00:00Z",
        policyVersion: "historic",
        components: { season: 1000 },
      };
      p.planLock = {
        dep: 100,
        deadline: "2025-03-31",
        planType: "custom",
        rows: [
          { date: "2025-01-01", amount: 100 },
          { date: "2025-03-31", amount: 900 },
        ],
      };
      p.payments =
        team.id === "past"
          ? [
              {
                amount: 1000,
                date: "2025-03-31",
                fee: 0,
                charged: 1000,
                method: "cash",
                label: "Synthetic receipt",
                receipt: "fixture",
              },
            ]
          : [];
      plan.players[p.id] = {
        status: "Confirmed",
        note: "Historical",
        latePolicy: { fee: 2500, grace: 7, hold: 21, removal: 35 },
      };
    }
    await sql`insert into team_fee_plans(team_id,revision,payload) values(${team.id},0,${JSON.stringify(plan)}::jsonb)`;
  }
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,3,false)`;
  await sql`update team_budget_master set payload=jsonb_set(payload,'{overheadReviewed}','true'::jsonb) where id='master'`;
  return { sql, club };
}
async function capture(sql: Sql) {
  const preview = await previewFinancialBasisInitialization(sql, "owner");
  return initializeFinancialBasisForOwner(sql, "owner", {
    ...preview,
    reason: "Disposable synthetic consumer fixture",
  });
}
async function activateFixture(sql: Sql) {
  // This prospective schema exists only in this disposable PGlite fixture.
  // Shipped migrations retain both constraints and cannot represent activation.
  await sql.query(
    "alter table financial_basis_state drop constraint financial_basis_state_activation_state_check, drop constraint financial_basis_state_active_version_check",
  );
  await sql`update financial_basis_state set activation_state='active',active_version=current_version where id='oklahoma-prospects'`;
}
function withoutVersion<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (key, value) => (key === "basisVersion" ? undefined : value)),
  );
}
async function saved(sql: Sql) {
  return withFinancialContext(sql, "owner", "read", async (_tx, context) =>
    structuredClone(context),
  );
}

test("fee/budget consumers preserve null and captured behavior, then use only frozen prospective inputs", async () => {
  const { sql, club } = await fixture();
  await sql`update profiles set name='Z Owner profile name' where user_id='owner'`;
  club.catalog = [
    {
      ...club.catalog[0],
      id: "frozen-event",
      org: "Fixture league",
      start: "2027-05-01",
      fee: 95.67,
    },
  ];
  club.teams[0].tournamentIds = ["frozen-event"];
  await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
  await sql`update team_fee_plans set payload=jsonb_set(payload,'{budget,scheduleCostsAutomatic}','true') where team_id='draft'`;
  const activity = {
    id: "11111111-1111-4111-8111-111111111111",
    teamId: "draft",
    revision: 1,
    kind: "game",
    title: "Frozen financial event",
    date: "2027-05-10",
    startTime: "10:00",
    endTime: "12:00",
    location: "Synthetic fixture",
    status: "scheduled",
    ourRuns: 0,
    oppRuns: 0,
    stats: [],
    entryFee: 25000,
    travel: "travel",
    overnightNights: 2,
  };
  await sql`insert into team_activities(id,team_id,revision,payload,updated_by) values(${activity.id},'draft',1,${JSON.stringify(activity)}::jsonb,'owner')`;
  const views = new Map<string, Awaited<ReturnType<typeof feeWorkspace>>>();
  for (const id of ["owner", "coach", "parent", "athlete", "stranger"])
    views.set(id, await feeWorkspace(sql, id));
  const master = await getBudgetMaster(sql, "owner"),
    uniform = await teamUniform(sql, "parent", "published"),
    funding = await teamFundingStatus(sql, "parent", "late");
  assert.equal(views.get("owner")!.teams.find((t) => t.id === "draft")!.choices!.tournament, 34567);
  assert.equal(views.get("owner")!.teams.find((t) => t.id === "draft")!.choices!.hotelNights, 2);
  await capture(sql);
  for (const [id, view] of views) assert.deepEqual(await feeWorkspace(sql, id), view);
  await activateFixture(sql);
  for (const [id, view] of views)
    assert.deepEqual(withoutVersion(await feeWorkspace(sql, id)), view);
  assert.deepEqual(withoutVersion(await getBudgetMaster(sql, "owner")), master);
  const changed = structuredClone(club);
  changed.teams.reverse();
  changed.teams.forEach((t) => {
    t.name = "Operational rename";
    t.coachEmail = "stranger@example.invalid";
    t.roster = [];
    t.months = 36;
    t.tournamentIds = ["new-event"];
  });
  changed.teams.push({ ...structuredClone(club.teams[0]), id: "new-operations-team", roster: [] });
  await sql`update club_state set payload=${JSON.stringify(changed)}::jsonb,rev=rev+1 where id='oklahoma-prospects'`;
  await sql`update team_fee_plans set payload=jsonb_set(payload,'{budget,fullOrg}','9999999')`;
  await sql`update team_budget_master set payload=jsonb_set(payload,'{hotelNightly}','9999999')`;
  await sql`delete from team_activities`;
  await sql`insert into club_households(id,primary_email) values('frozen-home','stranger@example.invalid')`;
  await sql`insert into person_guardian_links(household_id,user_id) values('frozen-home','stranger')`;
  await sql`update profiles set role='coach' where user_id='stranger'`;
  await sql`update profiles set name='Operational profile rename' where user_id='owner'`;
  await sql`update "user" set email='changed-parent@example.invalid' where id='parent'`;
  await sql`insert into "user"(id,email,name,"emailVerified") values('replacement','parent@example.invalid','Replacement',true)`;
  await sql`insert into profiles(user_id,email,name,role) values('replacement','parent@example.invalid','Replacement','parent')`;
  assert.equal(
    (await feeWorkspace(sql, "replacement")).teams.length,
    0,
    "A new account cannot inherit frozen guardianship by reusing an email",
  );
  for (const [id, view] of views)
    assert.deepEqual(
      withoutVersion(await feeWorkspace(sql, id)),
      view,
      id + " uses saved membership and attribution",
    );
  assert.deepEqual(withoutVersion(await getBudgetMaster(sql, "owner")), master);
  assert.deepEqual(await teamUniform(sql, "parent", "published"), uniform);
  assert.deepEqual(await teamFundingStatus(sql, "parent", "late"), funding);
  assert.equal(
    (await saved(sql)).feePlans.find((r) => r.team_id === "published")!.payload.publishedBudget,
    undefined,
  );
  await assert.rejects(() => initializeTeamBudget(sql, changed.teams.at(-1)!), /enrollment/);
  await assert.rejects(() => feeWorkspace(sql, "operations"), /financial.*access/i);
  await sql`update "user" set "disabledAt"=now() where id='parent'`;
  await assert.rejects(() => feeWorkspace(sql, "parent"), /access/);
});

test("captured state keeps legacy writes authoritative and missing clubs retain fee-specific errors", async () => {
  const { sql } = await fixture();
  await capture(sql);
  const prior = (await readFinancialBasisForOwner(sql, "owner"))!;
  await mutateFeePlan(sql, "owner", {
    action: "save",
    teamId: "draft",
    revision: 0,
    budget: { ...readyBudget(), fullOrg: 76543 },
    uniforms: [],
    expenses: [],
  });
  assert.equal(
    (await feeWorkspace(sql, "owner")).teams.find((t) => t.id === "draft")!.private!.plan.budget
      .fullOrg,
    76543,
  );
  assert.deepEqual(
    await readFinancialBasisForOwner(sql, "owner"),
    prior,
    "Captured versions are not silently updated by legacy writes",
  );
  await sql`delete from club_state where id='oklahoma-prospects'`;
  await assert.rejects(() => feeWorkspace(sql, "owner"), /Team records are unavailable/);
  await assert.rejects(() => teamUniform(sql, "owner", "draft"), /Team records are unavailable/);
  await assert.rejects(
    () => teamFundingStatus(sql, "owner", "draft"),
    /Team records are unavailable/,
  );
  await assert.rejects(
    () =>
      setFeeBusiness(sql, "owner", {
        revision: 0,
        value: { overhead: 0, reserve: 0, nolanBps: 5000, period: "", teamIds: [] },
      }),
    /Team records are unavailable/,
  );
  const budget = await getBudgetMaster(sql, "owner");
  await saveBudgetMaster(sql, "owner", budget.revision, budget.value);
  assert.equal((await getBudgetMaster(sql, "owner")).revision, budget.revision + 1);
});

test("prospective fee mutations cover defaults, save, roles, proposals, publication, business/master CAS and closure", async () => {
  const { sql } = await fixture();
  await capture(sql);
  await activateFixture(sql);
  const act = async (
    action: Omit<z.infer<typeof feeAction>, "teamId" | "revision" | "basisVersion"> &
      Record<string, unknown>,
    id = "owner",
    teamId = "draft",
  ) => {
    const view = (await feeWorkspace(sql, "owner")).teams.find((t) => t.id === teamId)!;
    return mutateFeePlan(sql, id, {
      ...action,
      teamId,
      revision: view.revision,
      basisVersion: view.basisVersion,
    } as z.infer<typeof feeAction>);
  };
  await act({ action: "applyDefaults", key: "baseball:14:spring", confirmed: true });
  await act({ action: "save", budget: readyBudget(), uniforms: [], expenses: [] });
  await sql`insert into club_requests(id,kind,payload) values('new-operational-offer','tryout',${JSON.stringify({ teamId: "draft", stage: "offer", rosterRole: "po" })}::jsonb)`;
  await act({ action: "playerRole", playerId: "draft-1", role: "po" });
  await act({ action: "propose", tournament: 10000, uniformId: "" }, "coach");
  await act({ action: "publish", confirmed: true });
  const published = (await feeWorkspace(sql, "owner")).teams.find((t) => t.id === "draft")!;
  assert.equal(published.status, "published");
  await act(
    { action: "accept", playerId: "draft-0", consent: true, name: "Parent Person" },
    "parent",
  );
  await act(
    { action: "accept", playerId: "draft-1", consent: true, name: "Parent Person" },
    "parent",
  );
  const frozen = await saved(sql);
  const draft = frozen.club.teams.find((t) => t.id === "draft")!;
  assert.equal(Math.round(draft.roster[0].feeLock!.amount * 100), published.publication!.full);
  assert.equal(Math.round(draft.roster[1].feeLock!.amount * 100), published.publication!.po);
  await act({ action: "releaseUniform", playerId: "past-0" }, "owner", "past");
  await act({ action: "close", confirmed: true }, "owner", "past");
  await act({ action: "lateFee", playerId: "late-0" }, "owner", "late");
  await assert.rejects(
    () => act({ action: "lateFee", playerId: "late-0" }, "owner", "late"),
    /already/,
  );
  await act(
    { action: "roster", playerId: "late-0", status: "Roster Hold", note: "Past agreed threshold" },
    "owner",
    "late",
  );
  await act(
    { action: "roster", playerId: "late-0", status: "Removed", note: "Past removal threshold" },
    "owner",
    "late",
  );
  await assert.rejects(
    () =>
      act(
        { action: "roster", playerId: "late-0", status: "Confirmed", note: "Still unpaid" },
        "owner",
        "late",
      ),
    /outstanding/,
  );
  const state = await saved(sql);
  assert.equal(state.club.teams.find((t) => t.id === "late")!.roster[0].feeLock!.amount, 1025);
  assert.equal(state.feePlans.find((r) => r.team_id === "past")!.payload.status, "closed");
  assert.equal(
    state.feePlans.find((r) => r.team_id === "past")!.payload.publishedBudget,
    undefined,
  );
  const budget = await getBudgetMaster(sql, "owner");
  const business = (await feeWorkspace(sql, "owner")).business!;
  await setFeeBusiness(sql, "owner", {
    revision: business.revision,
    basisVersion: business.basisVersion,
    value: { overhead: 123, reserve: 0, nolanBps: 5000, period: "Fixture", teamIds: ["draft"] },
  });
  await assert.rejects(
    () => saveBudgetMaster(sql, "owner", budget.revision, budget.value, budget.basisVersion),
    /basis changed/,
  );
  const latest = await getBudgetMaster(sql, "owner");
  const outcomes = await Promise.allSettled([
    saveBudgetMaster(
      sql,
      "owner",
      latest.revision,
      { ...latest.value, hotelNightly: 23000 },
      latest.basisVersion,
    ),
    saveBudgetMaster(
      sql,
      "owner",
      latest.revision,
      { ...latest.value, hotelNightly: 24000 },
      latest.basisVersion,
    ),
  ]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((r) => r.status === "rejected").length, 1);
  const [mirror] = await sql<{
    payload: unknown;
    revision: number;
  }>`select payload,revision from team_budget_master where id='master'`;
  const authoritative = (await saved(sql)).budgetMaster[0];
  assert.deepEqual(mirror, { payload: authoritative.payload, revision: authoritative.revision });
  const beforeFailure = await saved(sql),
    priorBusiness = beforeFailure.feeBusiness[0];
  await sql.query(
    "create function reject_fee_business_fixture() returns trigger language plpgsql as $$ begin raise exception 'Synthetic mirror failure'; end $$",
  );
  await sql.query(
    "create trigger reject_fee_business_fixture before update on team_fee_business for each row execute function reject_fee_business_fixture()",
  );
  await assert.rejects(
    () =>
      setFeeBusiness(sql, "owner", {
        revision: priorBusiness.revision,
        basisVersion: beforeFailure.version!,
        value: { ...priorBusiness.payload, overhead: 456 },
      }),
    /Synthetic mirror failure/,
  );
  assert.deepEqual(
    await saved(sql),
    beforeFailure,
    "Failed compatibility mirror rolls back the basis version too",
  );
  await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(
    () =>
      saveBudgetMaster(
        sql,
        "owner",
        authoritative.revision,
        authoritative.payload,
        beforeFailure.version!,
      ),
    /owner access/,
  );
});

test("owners can explicitly create plans for frozen seasons, never operations-only seasons", async () => {
  const { sql, club } = await fixture();
  await sql`delete from team_fee_plans where team_id='draft'`;
  await capture(sql);
  await activateFixture(sql);
  const state = await saved(sql);
  const input = {
    action: "save" as const,
    teamId: "draft",
    revision: 0,
    basisVersion: state.version!,
    budget: readyBudget(),
    uniforms: [],
    expenses: [],
  };
  await assert.rejects(() => mutateFeePlan(sql, "coach", input), /enrollment|Admin/);
  await mutateFeePlan(sql, "owner", input);
  assert.equal((await saved(sql)).feePlans.find((r) => r.team_id === "draft")!.revision, 1);
  club.teams.push({ ...structuredClone(club.teams[0]), id: "operations-only", roster: [] });
  await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
  await assert.rejects(
    () =>
      mutateFeePlan(sql, "owner", {
        ...input,
        teamId: "operations-only",
        basisVersion: state.version! + 1,
      }),
    /identity is unavailable/,
  );
  assert.equal(
    (await saved(sql)).feePlans.some((r) => r.team_id === "operations-only"),
    false,
  );
});

test("frozen guardian acceptance follows an explicit historical transfer alias without enrolling current operational members", async () => {
  const { sql, club } = await fixture();
  await capture(sql);
  const basis = (await readFinancialBasisForOwner(sql, "owner"))!;
  const agreement = basis.agreements.find((a) => a.originalPlayerId === "published-0")!;
  await addFinancialPlayerAliasForOwner(sql, "owner", {
    expectedVersion: basis.version,
    reason: "Synthetic transfer alias",
    agreementId: agreement.id,
    teamId: "transferred-team",
    playerId: "transferred-player",
  });
  await activateFixture(sql);
  const moved = structuredClone(club.teams.find((t) => t.id === "published")!.roster[0]);
  moved.id = "transferred-player";
  moved.teamId = "transferred-team";
  moved.parents = [
    {
      name: "New operational guardian",
      rel: "parent",
      email: "stranger@example.invalid",
      phone: "",
    },
  ];
  club.teams.find((t) => t.id === "published")!.roster.shift();
  club.teams.push({
    ...structuredClone(club.teams[0]),
    id: "transferred-team",
    name: "New operational name",
    roster: [moved],
  });
  await sql`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=rev+1 where id='oklahoma-prospects'`;
  const before = await saved(sql);
  const request = {
    action: "accept" as const,
    teamId: "transferred-team",
    playerId: "transferred-player",
    revision: 0,
    basisVersion: before.version!,
    consent: true as const,
    name: "Parent Person",
  };
  await assert.rejects(() => mutateFeePlan(sql, "stranger", request), /guardian/);
  await assert.rejects(() => mutateFeePlan(sql, "athlete", request), /guardian/);
  await assert.rejects(
    () => mutateFeePlan(sql, "parent", { ...request, basisVersion: undefined }),
    /basis changed/,
  );
  await mutateFeePlan(sql, "parent", request);
  const after = await saved(sql),
    plan = after.feePlans.find((r) => r.team_id === "published")!;
  const player = after.club.teams.find((t) => t.id === "published")!.roster[0];
  assert.equal(player.id, "published-0");
  assert.equal(player.teamId, "published");
  assert.equal(player.feeLock!.amount, 1000);
  assert.equal(
    plan.payload.publishedBudget,
    undefined,
    "Detached synthesis never becomes an amendment",
  );
  assert.deepEqual(
    plan.payload.budget,
    before.feePlans.find((r) => r.team_id === "published")!.payload.budget,
  );
  assert.equal(
    after.club.teams.some((t) => t.id === "transferred-team"),
    false,
  );
  await assert.rejects(() => mutateFeePlan(sql, "parent", request), /basis changed|plan changed/);
  const [live] = await sql<{
    payload: typeof club;
  }>`select payload from club_state where id='oklahoma-prospects'`;
  assert.equal(
    live.payload.teams.find((t) => t.id === "transferred-team")!.name,
    "New operational name",
  );
  assert.equal(
    live.payload.teams.find((t) => t.id === "transferred-team")!.roster[0].parents[0].email,
    "stranger@example.invalid",
  );
});

test("Owner operational schedule edits stay financially inert; explicit owner event amendment and admission use reviewed revisions", async () => {
  const { sql, club } = await fixture();
  const id = "22222222-2222-4222-8222-222222222222";
  const activity = {
    id,
    teamId: "draft",
    revision: 1,
    kind: "tournament" as const,
    title: "Captured tournament",
    date: "2027-05-10",
    startTime: "10:00",
    endTime: "12:00",
    location: "Synthetic facility",
    status: "scheduled" as const,
    ourRuns: 0,
    oppRuns: 0,
    stats: [],
    entryFee: 25000,
    travel: "travel" as const,
    overnightNights: 2,
  };
  club.catalog = [
    {
      ...club.catalog[0],
      id,
      name: activity.title,
      org: "Team schedule",
      start: activity.date,
      end: activity.date,
      fee: 0,
    },
  ];
  club.teams[0].tournamentIds = [id];
  await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
  await sql`update team_fee_plans set payload=jsonb_set(payload,'{budget,scheduleCostsAutomatic}','true') where team_id='draft'`;
  await sql`insert into team_activities(id,team_id,revision,payload,updated_by) values(${id},'draft',1,${JSON.stringify(activity)}::jsonb,'owner')`;
  assert.deepEqual(await financialEventCommitments(sql, "owner", "draft"), {
    basisVersion: null,
    events: [],
    candidates: [],
  });
  await assert.rejects(
    () =>
      amendFinancialEventCommitment(sql, "owner", {
        teamId: "draft",
        activityId: id,
        revision: 1,
        basisVersion: 1,
        date: "2027-05-20",
        status: "scheduled",
        entryFee: 45000,
        travel: "travel",
        overnightNights: 4,
        reason: "Cannot activate a financial event through a request",
      }),
    /active financial context/,
  );
  await capture(sql);
  await activateFixture(sql);
  const saveReviewedActivity = async (input: Parameters<typeof saveOrganizationActivity>[2]) => {
    await assert.rejects(saveOrganizationActivity(sql, "operations", input), /not authorized/);
    return saveOrganizationActivity(sql, "owner", input);
  };
  const original = await feeWorkspace(sql, "owner");
  const before = await financialEventCommitments(sql, "owner", "draft");
  assert.equal(before.events[0].entryFee, 25000);
  await assert.rejects(() => financialEventCommitments(sql, "operations", "draft"), /access/);
  await saveReviewedActivity({
    id,
    teamId: "draft",
    revision: 1,
    kind: "tournament",
    title: "Operational reschedule",
    date: "2027-08-10",
    startTime: "13:00",
    endTime: "15:00",
    location: "New operational location",
    status: "cancelled",
    laneIds: [],
  });
  assert.deepEqual(await feeWorkspace(sql, "owner"), original);
  assert.deepEqual(await financialEventCommitments(sql, "owner", "draft"), before);
  const change = {
    teamId: "draft",
    activityId: id,
    revision: 1,
    basisVersion: before.basisVersion!,
    date: "2027-05-20",
    status: "scheduled" as const,
    entryFee: 45000,
    travel: "travel" as const,
    overnightNights: 4,
    reason: "Owner reviewed revised financial commitment",
  };
  await assert.rejects(() => amendFinancialEventCommitment(sql, "operations", change), /access/);
  await assert.rejects(
    () =>
      amendFinancialEventCommitment(sql, "owner", {
        ...change,
        travel: "local",
        overnightNights: 4,
      }),
    /Overnight/,
  );
  await amendFinancialEventCommitment(sql, "owner", change);
  await assert.rejects(() => amendFinancialEventCommitment(sql, "owner", change), /changed/);
  const amended = await saved(sql);
  const changedEvent = amended.activities.find((event) => event.id === id)!;
  assert.equal(
    changedEvent.payload.title,
    "Captured tournament",
    "Amendments never resnapshot current operational metadata",
  );
  assert.equal(changedEvent.payload.date, "2027-05-20");
  assert.equal(changedEvent.payload.entryFee, 45000);
  assert.equal(amended.club.catalog.find((event) => event.id === id)!.start, "2027-05-20");
  const [live] = await sql<{
    payload: typeof activity;
    revision: number;
  }>`select payload,revision from team_activities where id=${id}`;
  assert.equal(live.payload.date, "2027-08-10");
  assert.equal(live.payload.status, "cancelled");
  assert.equal(live.revision, 2);
  const view = (await feeWorkspace(sql, "owner")).teams.find((team) => team.id === "draft")!;
  assert.equal(view.choices!.tournament, 45000);
  assert.equal(view.choices!.hotelNights, 4);
  assert.equal(view.status, "pending");
  assert.equal(view.private!.plan.budget.readiness!.schedule, false);
  const newId = "33333333-3333-4333-8333-333333333333";
  await saveReviewedActivity({
    id: newId,
    teamId: "draft",
    revision: 0,
    kind: "tournament",
    title: "New operational event",
    date: "2027-06-01",
    startTime: "10:00",
    endTime: "12:00",
    location: "Synthetic fixture",
    status: "scheduled",
    laneIds: [],
  });
  assert.deepEqual(
    await saved(sql),
    amended,
    "Operational creation does not admit a financial event",
  );
  const review = await financialEventCommitments(sql, "owner", "draft");
  assert.equal(review.candidates.length, 1);
  assert.equal(review.candidates[0].entryFee, 0);
  const admission = {
    teamId: "draft",
    activityId: newId,
    sourceRevision: review.candidates[0].revision,
    basisVersion: review.basisVersion!,
    confirmed: true as const,
    date: "2027-06-02",
    status: "scheduled" as const,
    entryFee: 12345,
    travel: "local" as const,
    overnightNights: 0,
    reason: "Owner explicitly approved this new financial event",
  };
  await assert.rejects(
    () =>
      admitFinancialEventCommitment(sql, "owner", {
        ...admission,
        sourceRevision: admission.sourceRevision + 1,
      }),
    /changed|revision/,
  );
  await assert.rejects(() => admitFinancialEventCommitment(sql, "operations", admission), /access/);
  await admitFinancialEventCommitment(sql, "owner", admission);
  const admitted = await saved(sql);
  assert.deepEqual(
    admitted.activities.find((event) => event.id === id),
    changedEvent,
    "Admission cannot refresh previously frozen events",
  );
  assert.equal(admitted.activities.find((event) => event.id === newId)!.payload.date, "2027-06-02");
  assert.equal(admitted.activities.find((event) => event.id === newId)!.payload.entryFee, 12345);
  assert.equal(
    (await feeWorkspace(sql, "owner")).teams.find((team) => team.id === "draft")!.choices!
      .tournament,
    57345,
  );
  await assert.rejects(
    () =>
      admitFinancialEventCommitment(sql, "owner", {
        ...admission,
        basisVersion: admitted.version!,
      }),
    /already|exists/,
  );
  const [newLive] = await sql<{
    payload: { date: string; entryFee?: number };
  }>`select payload from team_activities where id=${newId}`;
  assert.equal(newLive.payload.date, "2027-06-01");
  assert.equal(newLive.payload.entryFee, undefined);
});

test("transaction fee reads equal public projections and keep every nested date fixed", async (t) => {
  const { sql } = await fixture();
  const asOf = "2027-02-01";
  await sql`update team_fee_plans set payload=jsonb_set(jsonb_set(payload,'{budget,secondDue}','""'::jsonb),'{players,published-0}',${JSON.stringify({ status: "Invited", note: "", membershipAllocation: 9000, serviceStart: "2027-01-01", serviceEnd: "2027-03-31" })}::jsonb) where team_id='published'`;
  t.mock.timers.enable({ apis: ["Date"], now: new Date(asOf + "T12:00:00Z") });
  for (const mode of ["legacy", "captured", "basis"] as const) {
    if (mode === "captured") await capture(sql);
    if (mode === "basis") await activateFixture(sql);
    for (const userId of ["owner", "coach", "parent", "athlete", "stranger"]) {
      t.mock.timers.setTime(new Date(asOf + "T12:00:00Z").valueOf());
      const expected = await feeWorkspace(sql, userId);
      const snapshot = await saved(sql);
      await withFinancialContext(sql, userId, "read", async (tx, context) => {
        const originalContext = structuredClone(context);
        assert.deepEqual(await feeWorkspaceInTransaction(tx, context, asOf), expected);
        t.mock.timers.setTime(new Date("2027-04-01T12:00:00Z").valueOf());
        assert.deepEqual(
          await feeWorkspaceInTransaction(tx, context, asOf),
          expected,
          mode + ": preview schedules, payment status, membership recognition and health use asOf",
        );
        assert.deepEqual(
          context,
          originalContext,
          "Read normalization never mutates its issued context",
        );
      });
      assert.deepEqual(
        await saved(sql),
        snapshot,
        "Read normalization never writes financial inputs",
      );
      if (userId === "owner")
        assert.notDeepEqual(
          await feeWorkspace(sql, userId),
          expected,
          "Fixture exercises date-sensitive values",
        );
    }
  }
});

test("transaction fee reads require issued contexts and ignore caller-mutated authority and inputs", async () => {
  const { sql } = await fixture();
  const asOf = "2027-02-01";
  for (const basis of [false, true]) {
    if (basis) {
      await capture(sql);
      await activateFixture(sql);
    }
    await withFinancialContext(sql, "parent", "read", async (tx, context) => {
      const expected = await feeWorkspaceInTransaction(tx, context, asOf);
      await assert.rejects(
        () => feeWorkspaceInTransaction(tx, structuredClone(context), asOf),
        /context from this transaction/,
      );
      await assert.rejects(
        () => feeWorkspaceInTransaction(sql, context, asOf),
        /context from this transaction/,
      );
      context.principal.role = "admin";
      context.principal.owner = true;
      context.club.teams = [];
      context.feePlans = [];
      assert.deepEqual(await feeWorkspaceInTransaction(tx, context, asOf), expected);
      await assert.rejects(
        () => feeWorkspaceInTransaction(tx, context, "2027-02-30"),
        /valid date/,
      );
      await tx`update "user" set "disabledAt"=now() where id='parent'`;
      await assert.rejects(() => feeWorkspaceInTransaction(tx, context, asOf), /access/);
      await tx`update "user" set "disabledAt"=null where id='parent'`;
    });
  }
});

test("published-price projection follows the active financial source and withholds private plan fields", async () => {
  const { sql } = await fixture();
  const { publishedTeamPriceInTransaction } = await import("../finance/context.server");
  const read = () =>
    withFinancialContext(sql, "owner", "read", (tx) =>
      publishedTeamPriceInTransaction(tx, "published"),
    );
  const original = await read();
  assert.ok(original);
  assert.deepEqual(Object.keys(original).sort(), ["at", "finalDue", "full", "po", "revision"]);
  await capture(sql);
  await sql`update team_fee_plans set payload=jsonb_set(payload,'{published,full}','222000') where team_id='published'`;
  assert.equal((await read())!.full, 222000);
  await activateFixture(sql);
  assert.deepEqual(await read(), original);
});
