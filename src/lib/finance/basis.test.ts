import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { sampleClub } from "../teams/seed";
import { defaultBudget } from "../teams/fee-model";
import type { FeePlan } from "../teams/fee-contracts";
import {
  addFinancialPlayerAliasForOwner,
  hasFrozenFinancialGuardian,
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
  readFinancialBasisForOwner,
  resolveFinancialAgreement,
  resolveFinancialTeam,
  updateFinancialBasisForOwner,
} from "./basis.server";

const tables = [
  "financial_basis_state",
  "financial_basis_versions",
  "financial_team_seasons",
  "financial_player_agreements",
  "financial_team_aliases",
  "financial_player_aliases",
];

// Reuse one WASM instance; rebuild the disposable schema between tests. Multiple
// PGlite instances can trigger a Node/V8 WASM tier-up crash in this runtime.
const db = new PGlite();
after(() => db.close());

async function fixture() {
  await db.exec("drop schema public cascade; create schema public");
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
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = wrap(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["parent", "parent"],
    ["linked", "parent"],
    ["athlete", "player"],
    ["other", "parent"],
    ["operations", "admin"],
    ["fake-owner", "admin"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner'),('operations@example.invalid','operations')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('operations','suspended','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 17;
  club.teams = club.teams.slice(0, 2);
  for (const team of club.teams) team.roster = team.roster.slice(0, 3);
  const team = club.teams[0],
    player = team.roster[0];
  team.seasons = ["Winter 2026", "Spring 2027"];
  team.months = 6.25;
  team.staff = [
    {
      ...team.staff[0],
      id: "assistant-second",
      name: "Second",
      email: "second@example.invalid",
      role: "Assistant Coach",
    },
    {
      ...team.staff[0],
      id: "assistant-first",
      name: "First",
      email: "first@example.invalid",
      role: "Assistant Coach",
    },
  ];
  player.roleType = "po";
  player.withdrawn = true;
  player.familyId = "financial-home";
  player.parents = [{ name: "Parent", rel: "parent", email: "parent@example.invalid", phone: "" }];
  player.uniformWaived = true;
  player.agreement = {
    version: "historical-terms",
    signedBy: "Parent",
    signedAt: "2026-09-01T12:00:00Z",
  };
  player.feeLock = {
    amount: 1234.56,
    lockedAt: "2026-09-01T12:00:00Z",
    policyVersion: "historical-terms",
    components: { unusualLegacyComponent: 1234.56 },
  };
  player.planLock = {
    dep: 234.56,
    deadline: "2027-04-01",
    planType: "historical",
    rows: [
      { amount: 234.56, date: "2026-10-01" },
      { amount: 1000, date: "2027-04-01" },
    ],
  };
  player.payments = [
    {
      date: "2026-10-01",
      amount: 100,
      fee: 0,
      charged: 100,
      method: "cash",
      label: "historic",
      receipt: "fixture",
    },
  ];
  player.credits = [{ label: "historical credit", amount: 12.34 }];
  const plan: FeePlan = {
    budget: {
      ...defaultBudget(),
      baseline: 11,
      months: 6.25,
      start: "2026-12-01",
      end: "2027-06-15",
      hotelNights: 3,
      hotelNightly: 12345,
      costs: [{ id: "cost-1", name: "Assistant coach", cents: 101 }],
    },
    uniforms: [],
    status: "published",
    revision: 9,
    expenses: [],
    history: [],
    players: {
      [player.id]: {
        status: "Roster Hold",
        note: "Financial note",
        membershipAllocation: 4321,
        lateFeeApplied: 12,
      },
    },
  };
  // Intentionally no publishedBudget or published offer. Absence is preserved.
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,17,false)`;
  await sql`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,9)`;
  await sql`insert into club_households(id,primary_email) values('financial-home','parent@example.invalid')`;
  await sql`insert into household_members(household_id,user_id) values('financial-home','linked')`;
  await sql`insert into person_guardian_links(household_id,user_id) values('financial-home','athlete')`;
  await sql`insert into person_player_links(player_id,user_id) values(${player.id},'athlete')`;
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify({ coaches: [{ id: "original-coach", name: "Original", email: "original@example.invalid", active: true }], coachPayouts: [{ coachId: "original-coach", serviceId: "s1", splitPct: 41 }] })})`;
  await sql`insert into booking_records(id,coach_id,product_id,starts_at,ends_at,resources,status) values('lesson','original-coach','s1','2026-10-01 12:00Z','2026-10-01 13:15Z','[]'::jsonb,'completed')`;
  await sql`insert into contractor_earnings(booking_id,coach_id,gross_cents,split_pct,amount_cents) values('lesson','original-coach',10001,41,4100)`;
  await sql`insert into finance_records(id,kind,payload,created_at) values('z-payee','payee','{"email":"original@example.invalid"}'::jsonb,'2026-01-01'),('a-payee','payee','{"email":"original@example.invalid"}'::jsonb,'2026-02-01')`;
  await sql`insert into team_activities(id,team_id,payload,updated_by,revision) values('00000000-0000-4000-8000-000000000001',${team.id},${JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", teamId: team.id, kind: "tournament", status: "scheduled", date: "2027-04-03", travel: "travel", overnightNights: 2, entryFee: 9876 })}::jsonb,'owner',7)`;
  return { db, sql, club, team, player, plan };
}

async function initialize(sql: Sql) {
  const preview = await previewFinancialBasisInitialization(sql, "owner");
  const receipt = await initializeFinancialBasisForOwner(sql, "owner", {
    ...preview,
    reason: "Explicit synthetic initialization",
  });
  const basis = await readFinancialBasisForOwner(sql, "owner");
  assert.ok(basis);
  return { basis, receipt };
}

test("migration is empty/private; read/preview cannot initialize or grant; owner identity is checked", async () => {
  const f = await fixture();
  for (const table of tables) assert.equal((await f.sql.query(`select * from ${table}`)).length, 0);
  assert.equal(await readFinancialBasisForOwner(f.sql, "owner"), null);
  const preview = await previewFinancialBasisInitialization(f.sql, "owner");
  assert.equal(preview.teams, 2);
  assert.equal(
    preview.agreements,
    f.club.teams.reduce((n, t) => n + t.roster.length, 0),
  );
  assert.equal((await f.sql`select * from financial_basis_state`).length, 0);
  for (const user of ["parent", "athlete", "other", "operations", "fake-owner", "missing"]) {
    await assert.rejects(
      readFinancialBasisForOwner(f.sql, user),
      /Financial owner access required/,
    );
    await assert.rejects(
      initializeFinancialBasisForOwner(f.sql, user, { ...preview, reason: "Denied" }),
      /Financial owner access required/,
    );
  }
  const protectedTables = await f.sql<{
    relrowsecurity: boolean;
  }>`select relrowsecurity from pg_class where relname=any(${tables}::text[])`;
  assert.equal(protectedTables.length, tables.length);
  assert.ok(protectedTables.every((t) => t.relrowsecurity));
  assert.equal((await f.sql`select * from financial_basis_state`).length, 0);
  assert.equal(
    (await f.sql`select user_id from owner_grants where user_id='fake-owner'`).length,
    0,
  );
  await f.sql`update "user" set "emailVerified"=false where id='owner'`;
  await assert.rejects(
    readFinancialBasisForOwner(f.sql, "owner"),
    /Financial owner access required/,
  );
  await f.sql`update "user" set "emailVerified"=true,"disabledAt"=now() where id='owner'`;
  await assert.rejects(
    readFinancialBasisForOwner(f.sql, "owner"),
    /Financial owner access required/,
  );
  await f.sql`update "user" set "disabledAt"=null where id='owner'`;
  await f.sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(
    readFinancialBasisForOwner(f.sql, "owner"),
    /Financial owner access required/,
  );
});

test("initialization copies raw inputs exactly and rejects stale source revisions/determinants", async () => {
  const f = await fixture();
  const preview = await previewFinancialBasisInitialization(f.sql, "owner");
  await f.sql`update team_fee_plans set revision=revision+1 where team_id=${f.team.id}`;
  await assert.rejects(
    initializeFinancialBasisForOwner(f.sql, "owner", { ...preview, reason: "Stale plan" }),
    /source inputs changed/,
  );
  assert.equal((await f.sql`select * from financial_basis_state`).length, 0);
  const fresh = await previewFinancialBasisInitialization(f.sql, "owner");
  await assert.rejects(
    initializeFinancialBasisForOwner(f.sql, "owner", {
      ...fresh,
      sourceClubRevision: 16,
      reason: "Stale club",
    }),
    /source inputs changed/,
  );
  const { basis } = await initialize(f.sql);
  assert.deepEqual(basis.inputs.club, f.club);
  assert.deepEqual(basis.inputs.feePlans[0].payload, f.plan);
  assert.equal(basis.inputs.feePlans[0].revision, 10);
  assert.equal("publishedBudget" in basis.inputs.feePlans[0].payload, false);
  assert.equal(basis.inputs.feePlans.length, 1, "No default budget created for second team");
  assert.deepEqual(
    basis.inputs.compensation.payeesAndRules.map((r) => r.id),
    ["z-payee", "a-payee"],
  );
  assert.deepEqual(basis.inputs.compensation.development[0].coachPayouts, [
    { coachId: "original-coach", serviceId: "s1", splitPct: 41 },
  ]);
  assert.equal(basis.inputs.compensation.earnings[0].amount_cents, 4100);
  assert.equal(basis.inputs.activities[0].payload.entryFee, 9876);
  assert.equal(basis.inputs.activities[0].revision, 7);
  const agreement = resolveFinancialAgreement(basis, { teamId: f.team.id, playerId: f.player.id });
  assert.deepEqual(agreement.player, f.player);
  assert.notEqual(agreement.identity.id, f.player.id);
  assert.equal(
    resolveFinancialAgreement(basis, { agreementId: agreement.identity.id }).player.id,
    f.player.id,
  );
  assert.equal(
    resolveFinancialTeam(basis, { teamId: f.team.id }).identity.id,
    agreement.identity.teamSeasonId,
  );
  assert.equal((await f.sql<{ rev: number }>`select rev from club_state`)[0].rev, 17);
  assert.deepEqual(
    (await f.sql<{ payload: typeof f.club }>`select payload from club_state`)[0].payload,
    f.club,
  );
  await assert.rejects(
    initializeFinancialBasisForOwner(f.sql, "owner", { ...fresh, reason: "Again" }),
    /already initialized/,
  );
});

test("operational contact, roster, coaching, season, schedule and owner metadata changes never resnapshot", async () => {
  const f = await fixture();
  const { basis } = await initialize(f.sql);
  const agreementId = resolveFinancialAgreement(basis, { teamId: f.team.id, playerId: f.player.id })
    .identity.id;
  for (const user of ["parent", "linked", "athlete"])
    assert.equal(hasFrozenFinancialGuardian(basis, agreementId, user), true);
  assert.equal(hasFrozenFinancialGuardian(basis, agreementId, "other"), false);
  const operational = structuredClone(f.club);
  const moved = operational.teams[0].roster.shift()!;
  moved.teamId = operational.teams[1].id;
  moved.roleType = "full";
  moved.withdrawn = false;
  moved.uniformWaived = false;
  moved.familyId = "other-home";
  moved.parents[0].email = "other@example.invalid";
  operational.teams[1].roster.push(moved);
  operational.teams[0].staff.reverse();
  operational.teams[0].coachEmail = "different@example.invalid";
  operational.teams[0].seasonStart = "2030-01-01";
  operational.teams[0].months = 1;
  operational.teams[0].tournamentIds = [];
  await f.sql`update club_state set payload=${JSON.stringify(operational)}::jsonb,rev=rev+1`;
  await f.sql`update "user" set email='changed@example.invalid',name='Changed' where id='parent'`;
  await f.sql`delete from household_members where user_id='linked'`;
  await f.sql`insert into household_members(household_id,user_id) values('financial-home','other')`;
  await f.sql`delete from person_guardian_links where user_id='athlete'`;
  await f.sql`update booking_records set coach_id='replacement',starts_at='2030-01-01 12:00Z',ends_at='2030-01-01 13:00Z'`;
  await f.sql`update team_activities set payload=jsonb_set(payload,'{entryFee}','1'::jsonb),revision=revision+1`;
  await f.sql`update team_fee_plans set payload=jsonb_set(payload,'{budget,baseline}','99'::jsonb),revision=revision+1`;
  await f.sql`update team_budget_master set revision=revision+1,payload=jsonb_set(payload,'{membershipMonthly}','1'::jsonb)`;
  const after = await readFinancialBasisForOwner(f.sql, "owner");
  assert.deepEqual(after, basis);
  for (const user of ["parent", "linked", "athlete"])
    assert.equal(hasFrozenFinancialGuardian(after!, agreementId, user), true);
  assert.equal(hasFrozenFinancialGuardian(after!, agreementId, "other"), false);
  assert.equal(resolveFinancialAgreement(after!, { agreementId }).player.withdrawn, true);
  assert.throws(
    () =>
      resolveFinancialAgreement(after!, { teamId: operational.teams[1].id, playerId: moved.id }),
    /unavailable/,
  );
  await assert.rejects(previewFinancialBasisInitialization(f.sql, "owner"), /already initialized/);
});

test("CAS serializes ledger amendments, preserves identity/history and rolls back partial failures", async () => {
  const f = await fixture();
  const { basis } = await initialize(f.sql);
  const agreementId = resolveFinancialAgreement(basis, { teamId: f.team.id, playerId: f.player.id })
    .identity.id;
  await assert.rejects(
    updateFinancialBasisForOwner(
      f.sql,
      "parent",
      { expectedVersion: 1, reason: "Denied" },
      () => {},
    ),
    /owner access/,
  );
  await assert.rejects(
    updateFinancialBasisForOwner(
      f.sql,
      "owner",
      { expectedVersion: 1, reason: "Rollback" },
      (draft) => {
        resolveFinancialAgreement(draft, { agreementId }).player.payments.push({
          ...f.player.payments[0],
          amount: 20,
        });
        throw new Error("Synthetic failure");
      },
    ),
    /Synthetic failure/,
  );
  assert.equal((await readFinancialBasisForOwner(f.sql, "owner"))!.version, 1);
  for (const mutate of [
    (draft: typeof basis) => {
      draft.inputs.club.teams[0].roster.pop();
    },
    (draft: typeof basis) => {
      draft.agreements[0].teamSeasonId = draft.teams.find(
        (t) => t.id !== draft.agreements[0].teamSeasonId,
      )!.id;
    },
    (draft: typeof basis) => {
      draft.playerAliases[0].agreementId = "different";
    },
    (draft: typeof basis) => {
      draft.sourceDigest = "altered";
    },
  ])
    await assert.rejects(
      updateFinancialBasisForOwner(
        f.sql,
        "owner",
        { expectedVersion: 1, reason: "Bad identity edit" },
        mutate,
      ),
      /identity and aliases/,
    );
  const results = await Promise.allSettled(
    [1, 2].map((amount) =>
      updateFinancialBasisForOwner(
        f.sql,
        "owner",
        { expectedVersion: 1, reason: "Explicit synthetic ledger update" },
        (draft) => {
          resolveFinancialAgreement(draft, { agreementId }).player.payments.push({
            ...f.player.payments[0],
            amount,
          });
        },
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const after = (await readFinancialBasisForOwner(f.sql, "owner"))!;
  assert.equal(after.version, 2);
  assert.equal(resolveFinancialAgreement(after, { agreementId }).player.payments.length, 2);
  assert.deepEqual(after.agreements, basis.agreements);
  assert.deepEqual(
    (await f.sql<{ payload: typeof f.club }>`select payload from club_state`)[0].payload,
    f.club,
  );
  assert.deepEqual(
    (
      await f.sql<{
        payload: { club: typeof f.club };
      }>`select payload from financial_basis_versions where version=1`
    )[0].payload.club,
    f.club,
  );
  await assert.rejects(
    f.sql`update financial_basis_versions set reason='rewritten' where version=1`,
    /append-only/,
  );
  await assert.rejects(f.sql`delete from financial_player_aliases`, /append-only/);
  await assert.rejects(
    f.sql`update financial_player_agreements set original_player_id='repointed'`,
    /append-only/,
  );
  const originalCount = (await f.sql`select * from financial_basis_versions`).length;
  await assert.rejects(
    updateFinancialBasisForOwner(
      f.sql,
      "owner",
      { expectedVersion: 2, reason: "Invalid JSON" },
      (draft) => {
        draft.inputs.club.teams[0].months = Number.NaN;
      },
    ),
    /finite JSON/,
  );
  assert.equal((await f.sql`select * from financial_basis_versions`).length, originalCount);
});

test("legacy transfer aliases are explicit, append-only and resolve original agreement for old orders", async () => {
  const f = await fixture();
  const { basis } = await initialize(f.sql);
  const agreement = resolveFinancialAgreement(basis, { teamId: f.team.id, playerId: f.player.id });
  await addFinancialPlayerAliasForOwner(f.sql, "owner", {
    expectedVersion: 1,
    reason: "Explicit transfer alias",
    agreementId: agreement.identity.id,
    teamId: "new-operational-team",
    playerId: "new-operational-player",
  });
  const after = (await readFinancialBasisForOwner(f.sql, "owner"))!;
  assert.equal(after.version, 2);
  assert.deepEqual(after.inputs, basis.inputs);
  assert.equal(
    resolveFinancialAgreement(after, {
      teamId: "new-operational-team",
      playerId: "new-operational-player",
    }).identity.id,
    agreement.identity.id,
  );
  assert.equal(
    resolveFinancialAgreement(after, { teamId: f.team.id, playerId: f.player.id }).identity.id,
    agreement.identity.id,
  );
  assert.throws(
    () => resolveFinancialAgreement(after, { teamId: "wrong-team", playerId: f.player.id }),
    /unavailable/,
  );
  await assert.rejects(
    addFinancialPlayerAliasForOwner(f.sql, "owner", {
      expectedVersion: 2,
      reason: "Repoint",
      agreementId: after.agreements.find((a) => a.id !== agreement.identity.id)!.id,
      teamId: f.team.id,
      playerId: f.player.id,
    }),
    /cannot be repointed/,
  );
  await assert.rejects(
    addFinancialPlayerAliasForOwner(f.sql, "owner", {
      expectedVersion: 1,
      reason: "Stale",
      agreementId: agreement.identity.id,
      teamId: "other",
      playerId: "other",
    }),
    /changed/,
  );
});

test("captured versions stay inactive and partial activation markers are rejected", async () => {
  const f = await fixture();
  const { basis, receipt } = await initialize(f.sql);
  assert.equal(basis.activationState, "captured");
  assert.equal(basis.activeVersion, null);
  assert.equal(receipt.activationState, "captured");
  assert.equal(receipt.activeVersion, null);
  await assert.rejects(
    f.sql`update financial_basis_state set activation_state='active'`,
    /check constraint/,
  );
  await assert.rejects(
    f.sql`update financial_basis_state set active_version=1`,
    /check constraint/,
  );
  assert.equal((await readFinancialBasisForOwner(f.sql, "owner"))!.activeVersion, null);
});

test("frozen billing matches effective guardian-only and lazily materialized household access", async () => {
  const f = await fixture();
  await f.sql`delete from household_members where user_id='linked'`;
  await f.sql`insert into person_guardian_links(household_id,user_id) values('financial-home','linked')`;
  await f.sql`update club_households set primary_email='other@example.invalid' where id='financial-home'`;
  const { basis } = await initialize(f.sql);
  const { identity } = resolveFinancialAgreement(basis, {
    teamId: f.team.id,
    playerId: f.player.id,
  });
  assert.equal(
    (await f.sql`select * from household_members where user_id in ('linked','other')`).length,
    0,
  );
  assert.equal(hasFrozenFinancialGuardian(basis, identity.id, "linked"), true);
  assert.equal(hasFrozenFinancialGuardian(basis, identity.id, "other"), true);
  const legacyLinked = await resolveIdentity(f.sql, "linked");
  const legacyOther = await resolveIdentity(f.sql, "other");
  assert.ok(legacyLinked.familyIds.includes(f.player.familyId));
  assert.ok(legacyOther.familyIds.includes(f.player.familyId));
  // A newly created account cannot inherit frozen attribution from an email.
  await f.sql`update "user" set email='changed@example.invalid' where id='other'`;
  await f.sql`insert into "user"(id,email,name,"emailVerified") values('new-user','other@example.invalid','New',true)`;
  assert.equal(hasFrozenFinancialGuardian(basis, identity.id, "new-user"), false);
  assert.equal(hasFrozenFinancialGuardian(basis, identity.id, "other"), true);
});

test("initialization failure is atomic and duplicate/malformed source identity fails closed", async () => {
  const f = await fixture();
  await f.db
    .exec(`create function fail_basis_fixture() returns trigger language plpgsql as $$ begin raise exception 'Synthetic identity insertion failure'; end $$;
      create trigger fail_basis_fixture before insert on financial_player_agreements for each row execute function fail_basis_fixture();`);
  const preview = await previewFinancialBasisInitialization(f.sql, "owner");
  await assert.rejects(
    initializeFinancialBasisForOwner(f.sql, "owner", { ...preview, reason: "Rollback all" }),
    /Synthetic identity insertion failure/,
  );
  for (const table of tables) assert.equal((await f.sql.query(`select * from ${table}`)).length, 0);
  await f.db.exec("drop trigger fail_basis_fixture on financial_player_agreements");
  const invalid = structuredClone(f.club);
  invalid.teams[1].roster[0].id = f.player.id;
  await f.sql`update club_state set payload=${JSON.stringify(invalid)}::jsonb`;
  await assert.rejects(
    previewFinancialBasisInitialization(f.sql, "owner"),
    /Duplicate, missing, or inconsistent/,
  );
  invalid.teams[1].roster[0].id = "valid-unique";
  invalid.teams[1].roster[0].teamId = "inconsistent";
  await f.sql`update club_state set payload=${JSON.stringify(invalid)}::jsonb`;
  await assert.rejects(
    previewFinancialBasisInitialization(f.sql, "owner"),
    /Duplicate, missing, or inconsistent/,
  );
  await f.sql`update club_state set payload=${JSON.stringify(f.club)}::jsonb,demo=true`;
  await assert.rejects(previewFinancialBasisInitialization(f.sql, "owner"), /non-demo club/);
  for (const table of tables) assert.equal((await f.sql.query(`select * from ${table}`)).length, 0);
});

test("only reviewed internal financial consumers import the basis; migrations do not activate", async () => {
  // Consumers are now DB-selected. This closed server-only inventory prevents
  // raw snapshot use by routes/UI and does not authorize activation.
  const reviewedModules = new Set([
    "lib/finance/basis.server.ts",
    "lib/finance/context.server.ts",
    "lib/finance/principal.server.ts",
    "lib/teams/financial-payment-adapter.server.ts",
    "lib/teams/fee.server.ts",
    "lib/teams/payment.server.ts",
    "lib/teams/store.ts",
    "lib/finance/sources.server.ts",
    "lib/finance/facility.server.ts",
    "lib/finance/self.server.ts",
    "lib/coordinator/organization-access.server.ts",
    "lib/finance/cutover-api.ts",
    "lib/finance/identity-admission.server.ts",
  ]);
  for (const file of await readdir("src", { recursive: true })) {
    if (!/\.(tsx?|mjs)$/.test(file) || /\.test(?:[.-])/.test(file)) continue;
    const source = await readFile("src/" + file, "utf8");
    assert.doesNotMatch(
      source,
      /(?:from\s*["'][^"']*context\.test-fixture|import\s*\(["'][^"']*context\.test-fixture)/,
      file,
    );
    if (reviewedModules.has(file)) continue;
    assert.doesNotMatch(
      source,
      /(?:from\s*["'][^"']*(?:basis|financial-payment-adapter)\.server|import\s*\(["'][^"']*(?:basis|financial-payment-adapter)\.server)/,
      file,
    );
  }
  const staged = await readFile("migrations/0070_financial_context.sql", "utf8");
  assert.doesNotMatch(
    staged,
    /drop\s+constraint\s+financial_basis_state_(?:activation_state|active_version)_check/i,
  );
  assert.doesNotMatch(staged, /update\s+financial_basis_state\s+set\s+activation_state/i);
  const migration = await readFile("migrations/0069_financial_basis.sql", "utf8");
  assert.doesNotMatch(migration, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(
    migration,
    /\bUPDATE\s+(?:club_state|profiles|owner_grants|organization_operational_access)\b/i,
  );
});
