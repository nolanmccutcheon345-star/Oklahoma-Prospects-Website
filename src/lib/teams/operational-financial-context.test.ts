import { randomUUID } from "node:crypto";
import {
  organizationWorkspace,
  saveOrganizationTeam,
  saveOrganizationPlayer,
  saveOrganizationStaff,
  moveOrganizationPlayer,
  saveOrganizationActivity,
} from "../coordinator/organization.server";
import { feeWorkspace } from "./fee.server";
import { financeWorkspace } from "../finance/store.server";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "./seed";
import { scopeClub } from "./privacy";
import { parseClubSave } from "./contracts";
import { operationalClubView, mergeOperationalSave } from "./operational-view";
import { persistClubSave, readStoredClub, scopedClubResult } from "./club-store.server";
import { teamFinancialView } from "./financial-view.server";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
} from "../finance/basis.server";
import {
  withFinancialContext,
  recordFinancialTeamPaymentInTransaction,
} from "../finance/context.server";
import { persistTeamSeasons } from "./season-save.server";
import { saveTeamActivity } from "./activity.server";
import { defaultBudget } from "./fee-model";
import type { FeePlan } from "./fee-contracts";

const db = new PGlite();
after(() => db.close());
function adapter(q: PGlite["query"], inTransaction = false): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await q(
        parts.reduce((s, p, i) => s + (i ? "$" + i : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (s: string, v: unknown[] = []) => (await q(s, v)).rows) as Sql["query"];
  sql.transaction = (work) => {
    assert.equal(inTransaction, false, "No nested transactions");
    return db.transaction((tx) => work(adapter(tx.query.bind(tx) as PGlite["query"], true)));
  };
  return sql;
}
const owner = {
  role: "admin" as const,
  email: "owner@example.invalid",
  familyId: "fam-owner",
  familyIds: [],
};
const parent = {
  role: "parent" as const,
  email: "parent@example.invalid",
  familyId: "home",
  familyIds: ["home"],
};
const coach = {
  role: "coach" as const,
  email: "coach@example.invalid",
  familyId: "fam-coach",
  familyIds: [],
};
async function fixture() {
  await db.exec("drop schema public cascade;create schema public");
  for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["parent", "parent"],
    ["coach", "coach"],
    ["athlete", "player"],
    ["other", "parent"],
    ["operations", "admin"],
    ["impostor", "admin"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified") values(${id},${id + "@example.invalid"},${id},true)`;
    await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${"fam-" + id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner'),('operations@example.invalid','operations')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('operations','active','owner')`;
  await sql`insert into club_households(id,primary_email) values('home','parent@example.invalid')`;
  await sql`insert into household_members(household_id,user_id) values('home','parent')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 4;
  club.teams = club.teams.slice(0, 2);
  for (const t of club.teams) t.roster = t.roster.slice(0, 2);
  const team = club.teams[0],
    p = team.roster[0];
  team.closed = false;
  team.coachEmail = coach.email;
  team.staff = [
    { ...team.staff[0], id: "own-staff", email: coach.email, monthly: 1743.19, applyAmount: 12.34 },
    { ...team.staff[0], id: "other-staff", email: "other@example.invalid", monthly: 6543.21 },
  ];
  p.familyId = "home";
  p.parents = [{ name: "Parent", rel: "guardian", email: parent.email, phone: "" }];
  p.email = "athlete@example.invalid";
  p.feeLock = {
    amount: 1000,
    lockedAt: "2026-01-01",
    policyVersion: "PRIVATE_POLICY_CANARY",
    components: { season: 1000 },
  };
  p.planLock = {
    dep: 100,
    deadline: "2027-01-01",
    planType: "four",
    rows: [{ date: "2027-01-01", amount: 1000 }],
  };
  p.payments = [
    {
      date: "2026-01-01",
      amount: 100,
      charged: 100,
      fee: 0,
      method: "cash",
      label: "PRIVATE_PAYMENT_CANARY",
      receipt: "receipt-canary",
    },
  ];
  p.credits = [{ label: "PRIVATE_CREDIT_CANARY", amount: 50 }];
  p.agreement = { version: "private-v1", signedBy: "Parent", signedAt: "2026-01-01" };
  p.depositPaid = true;
  Object.assign(club, { privateFinancialCanary: "TOP_SECRET_CANARY" });
  Object.assign(team, { privateFinancialCanary: "TEAM_SECRET_CANARY" });
  Object.assign(p, { privateFinancialCanary: "PLAYER_SECRET_CANARY" });
  club.audit = [{ at: "2026-01-01", action: "payment", detail: "AUDIT_PAYMENT_CANARY" }];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,4,false)`;
  const plan: FeePlan = {
    budget: defaultBudget(),
    status: "draft",
    revision: 0,
    uniforms: [],
    players: {},
    expenses: [],
    history: [],
  };
  await sql`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,0)`;
  return { sql, club, team, p };
}
async function capture(sql: Sql) {
  const preview = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    ...preview,
    reason: "Isolated synthetic desk test",
  });
}
async function activate(sql: Sql) {
  // Prospective schema is deliberately confined to this disposable test database.
  await sql.query(
    "alter table financial_basis_state drop constraint financial_basis_state_activation_state_check,drop constraint financial_basis_state_active_version_check",
  );
  await sql`update financial_basis_state set activation_state='active',active_version=current_version`;
}
async function financial(sql: Sql, id: string) {
  return withFinancialContext(sql, id, "read", async (_tx, c) => teamFinancialView(c));
}

test("uncaptured and captured modes preserve existing owner/family/coach desk values", async () => {
  const { sql, club } = await fixture();
  for (const [id, me] of [
    ["owner", owner],
    ["parent", parent],
    ["coach", coach],
  ] as const) {
    await withFinancialContext(sql, id, "read", async (_tx, c) => {
      const view = scopedClubResult(club, me, c);
      assert.deepEqual(view.club, scopeClub(club, me.role, me));
      assert.equal(view.financial, null);
    });
  }
  await capture(sql);
  await withFinancialContext(sql, "owner", "read", async (_tx, c) => {
    assert.equal(c.mode, "legacy");
    assert.deepEqual(scopedClubResult(club, owner, c).club, club);
  });
});

test("active operational payload has no financial canaries and rejects bulk money edits", async () => {
  const { sql, club, p } = await fixture();
  await capture(sql);
  await activate(sql);
  for (const me of [owner, parent, coach]) {
    const view = operationalClubView(club, me.role, me),
      text = JSON.stringify(view);
    for (const secret of [
      "PRIVATE_POLICY_CANARY",
      "PRIVATE_PAYMENT_CANARY",
      "PRIVATE_CREDIT_CANARY",
      "receipt-canary",
      "TOP_SECRET_CANARY",
      "TEAM_SECRET_CANARY",
      "PLAYER_SECRET_CANARY",
      "AUDIT_PAYMENT_CANARY",
    ])
      assert.equal(text.includes(secret), false, secret);
    parseClubSave({ club: view, baseRev: club._rev });
  }
  const view = operationalClubView(club, "admin", owner);
  const tamper = structuredClone(view);
  tamper.teams[0].roster[0].payments = [...p.payments];
  await assert.rejects(
    persistClubSave(sql, "owner", owner, { club: tamper, baseRev: club._rev }),
    /financial workspace/,
  );
  const terms = structuredClone(view);
  terms.settings.coachPayMin = 1;
  assert.throws(() => mergeOperationalSave(club, terms, "admin", owner), /financial workspace/);
  assert.equal((await readStoredClub(sql))!._rev, 4);
});

test("operational transfers, contacts, schedule and staff edits preserve scoped historical financial results", async () => {
  const { sql, club, team, p } = await fixture();
  await capture(sql);
  await activate(sql);
  const before = Object.fromEntries(
    await Promise.all(
      ["owner", "parent", "coach", "athlete", "other"].map(async (id) => [
        id,
        await financial(sql, id),
      ]),
    ),
  );
  assert.equal(before.parent!.obligations.length, 1);
  assert.equal(before.parent!.obligations[0].due, 850);
  assert.equal(before.coach!.staff.length, 1);
  assert.equal(before.coach!.staff[0].monthly, 1743.19);
  assert.equal(before.athlete!.obligations.length, 0);
  const next = operationalClubView(club, "admin", owner),
    moved = next.teams[0].roster.shift()!;
  moved.teamId = next.teams[1].id;
  moved.familyId = "changed";
  moved.parents = [{ name: "Other", rel: "guardian", email: "other@example.invalid", phone: "" }];
  next.teams[1].roster.push(moved);
  next.teams[0].staff = [];
  next.teams[0].coachEmail = "other@example.invalid";
  next.teams[0].name = "Renamed operational team";
  next.teams[0].seasonLabel = "Fall 2030";
  next.teams[0].months = 30;
  // Legacy referenced-catalog financial guards no longer constrain active operations.
  const event = next.catalog.find((e) => next.teams[0].tournamentIds.includes(e.id));
  if (event) event.start = "2030-01-01";
  const saved = await persistClubSave(sql, "owner", owner, { club: next, baseRev: 4 });
  assert.equal(saved.club.teams[1].roster.at(-1)!.teamId, next.teams[1].id);
  for (const id of ["owner", "parent", "coach", "athlete", "other"])
    assert.deepEqual(await financial(sql, id), before[id]);
  const remove = structuredClone(saved.club);
  remove.teams[1].roster = remove.teams[1].roster.filter((r) => r.id !== p.id);
  await persistClubSave(sql, "owner", owner, { club: remove, baseRev: saved.club._rev });
  assert.deepEqual(
    await financial(sql, "parent"),
    before.parent,
    "removal never hides an authorized historical agreement",
  );
  await sql`update "user" set email='changed-parent@example.invalid' where id='parent'`;
  assert.deepEqual(
    await financial(sql, "parent"),
    before.parent,
    "saved account binding survives email change",
  );
  await sql`insert into "user"(id,email,name,"emailVerified") values('new-account','parent@example.invalid','New',true)`;
  await sql`insert into profiles(user_id,name,email,role,family_id) values('new-account','New','parent@example.invalid','parent','home')`;
  assert.equal(
    (await financial(sql, "new-account"))!.obligations.length,
    0,
    "new account matching old email is not admitted",
  );
  const reload = (await readStoredClub(sql))!;
  await persistTeamSeasons(
    sql,
    { teamId: team.id, baseRev: reload._rev, seasons: ["Winter 2031"] },
    "owner",
  );
  await saveTeamActivity(sql, "owner", {
    id: "",
    teamId: team.id,
    revision: 0,
    kind: "tournament",
    title: "Operational event",
    date: "2031-01-01",
    startTime: "10:00",
    endTime: "11:00",
    location: "Field",
    status: "scheduled",
    stats: [],
    travel: "travel",
    overnightNights: 4,
    entryFee: 0,
    ourRuns: 0,
    oppRuns: 0,
  });
  for (const id of ["owner", "parent", "coach"])
    assert.deepEqual(await financial(sql, id), before[id]);
  const [plan] = await sql<{
    revision: number;
  }>`select revision from team_fee_plans where team_id=${team.id}`;
  assert.equal(plan.revision, 0);
});

test("financial payment CAS and operational CAS cannot lose each other; current security still denies", async () => {
  const { sql, club, team, p } = await fixture();
  await capture(sql);
  await activate(sql);
  const stale = operationalClubView(club, "admin", owner);
  await withFinancialContext(sql, "owner", "owner", (tx, c) =>
    recordFinancialTeamPaymentInTransaction(tx, c, {
      teamId: team.id,
      playerId: p.id,
      amount: 25,
      method: "cash",
      label: "Additional payment",
      expectedBasisVersion: 1,
    }),
  );
  stale.teams[0].name = "Operational rename";
  const saved = await persistClubSave(sql, "owner", owner, { club: stale, baseRev: 4 });
  assert.equal(saved.financial!.version, 2);
  assert.equal(saved.financial!.obligations.find((x) => x.playerId === p.id)!.due, 825);
  await assert.rejects(
    persistClubSave(sql, "owner", owner, { club: stale, baseRev: 4 }),
    /club changed/,
  );
  await assert.rejects(
    withFinancialContext(sql, "owner", "owner", (tx, c) =>
      recordFinancialTeamPaymentInTransaction(tx, c, {
        teamId: team.id,
        playerId: p.id,
        amount: 25,
        method: "cash",
        label: "stale",
        expectedBasisVersion: 1,
      }),
    ),
    /basis changed/,
  );
  for (const id of ["operations"])
    await assert.rejects(financial(sql, id), /financial account access/);
  await assert.rejects(
    persistClubSave(sql, "impostor", owner, { club: saved.club, baseRev: saved.club._rev }),
    /owner access/,
  );
  await sql`update "user" set "disabledAt"=now() where id='parent'`;
  await assert.rejects(financial(sql, "parent"), /financial account access/);
  await sql`update "user" set "emailVerified"=false where id='coach'`;
  await assert.rejects(financial(sql, "coach"), /financial account access/);
  await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(
    persistClubSave(sql, "owner", owner, { club: saved.club, baseRev: saved.club._rev }),
    /owner access/,
  );
});

test("real parent-role Sara operational APIs preserve complete team fee and finance outputs", async () => {
  const { sql, club, team, p } = await fixture();
  await sql`insert into "user"(id,email,name,"emailVerified") values('sara','sara@example.invalid','Sara',true)`;
  await sql`insert into profiles(user_id,name,email,role,family_id) values('sara','Sara','sara@example.invalid','parent','fam-sara')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','owner')`;
  await capture(sql);
  await assert.rejects(
    saveOrganizationTeam(sql, "sara", {
      revision: 4,
      teamId: team.id,
      changes: { coachEmail: "other@example.invalid" },
    }),
    /protected|owner|financial|workflow/i,
  );
  await activate(sql);
  const before = {
    desk: await financial(sql, "owner"),
    family: await financial(sql, "parent"),
    coach: await financial(sql, "coach"),
    fees: await feeWorkspace(sql, "owner"),
    finance: await financeWorkspace(sql, "owner"),
  };
  let revision = 4;
  const advance = async (work: Promise<{ revision: number }>) => {
    revision = (await work).revision;
  };
  await advance(
    saveOrganizationTeam(sql, "sara", {
      revision,
      teamId: team.id,
      changes: {
        headCoach: "Changed operational coach",
        coachEmail: "other@example.invalid",
        seasonLabel: "Fall 2030",
        seasonStart: "2030-09-01",
        seasonEnd: "2030-12-01",
      },
    }),
  );
  const newTeamId = randomUUID(),
    newPlayerId = randomUUID(),
    newStaffId = randomUUID();
  await advance(
    saveOrganizationTeam(sql, "sara", {
      revision,
      teamId: newTeamId,
      changes: {
        name: "New operational roster",
        sport: team.sport === "baseball" ? "softball" : "baseball",
        age: team.age === "18U" ? "16U" : "18U",
        seasonLabel: "Fall 2030",
      },
    }),
  );
  await advance(
    saveOrganizationPlayer(sql, "sara", {
      revision,
      teamId: team.id,
      playerId: newPlayerId,
      changes: {
        name: "New operational player",
        parents: [{ name: "Other", rel: "guardian", email: "other@example.invalid", phone: "" }],
      },
    }),
  );
  await advance(
    saveOrganizationPlayer(sql, "sara", {
      revision,
      teamId: team.id,
      playerId: p.id,
      changes: {
        parents: [
          {
            name: "New contact",
            rel: "guardian",
            email: "other@example.invalid",
            phone: "5550100",
          },
        ],
        email: "changed-athlete@example.invalid",
      },
    }),
  );
  await advance(
    saveOrganizationStaff(sql, "sara", {
      revision,
      teamId: team.id,
      staffId: "own-staff",
      changes: {
        name: "Changed operational staff",
        email: "other@example.invalid",
        role: "Assistant coach",
      },
    }),
  );
  await advance(
    saveOrganizationStaff(sql, "sara", {
      revision,
      teamId: team.id,
      staffId: newStaffId,
      changes: {
        name: "New operational coach",
        email: "newcoach@example.invalid",
        role: "Assistant coach",
      },
    }),
  );
  await advance(
    moveOrganizationPlayer(sql, "sara", {
      revision,
      teamId: team.id,
      playerId: p.id,
      destinationTeamId: newTeamId,
    }),
  );
  await advance(
    saveOrganizationTeam(sql, "sara", {
      revision,
      teamId: newTeamId,
      changes: { age: "Adult", sport: team.sport },
    }),
  );
  await advance(
    saveOrganizationPlayer(sql, "sara", {
      revision,
      teamId: newTeamId,
      playerId: p.id,
      changes: { withdrawn: true },
    }),
  );
  await saveOrganizationActivity(sql, "sara", {
    id: randomUUID(),
    revision: 0,
    teamId: team.id,
    kind: "tournament",
    title: "Operational date change",
    date: "2030-10-01",
    startTime: "10:00",
    endTime: "11:00",
    location: "Field",
    status: "scheduled",
    laneIds: [],
  });
  const after = {
    desk: await financial(sql, "owner"),
    family: await financial(sql, "parent"),
    coach: await financial(sql, "coach"),
    fees: await feeWorkspace(sql, "owner"),
    finance: await financeWorkspace(sql, "owner"),
  };
  assert.deepEqual(
    after,
    before,
    "complete financial DTOs, fees, receivables, wages, protections, distributions and audit stay identical",
  );
  const view = await organizationWorkspace(sql, "sara");
  assert.ok(view.teams.some((t) => t.id === newTeamId));
  assert.ok(
    view.teams.find((t) => t.id === newTeamId)!.roster.some((p2) => p2.id === p.id && p2.withdrawn),
  );
  for (const secret of [
    "PRIVATE_POLICY_CANARY",
    "PRIVATE_PAYMENT_CANARY",
    "PRIVATE_CREDIT_CANARY",
    "receipt-canary",
    "TOP_SECRET_CANARY",
    "TEAM_SECRET_CANARY",
    "PLAYER_SECRET_CANARY",
    "AUDIT_PAYMENT_CANARY",
  ])
    assert.equal(JSON.stringify(view).includes(secret), false, secret);
  assert.equal(
    after.desk!.coachTeams.some((t) => t.teamId === newTeamId),
    false,
  );
  assert.equal(
    after.desk!.obligations.some((p2) => p2.playerId === newPlayerId),
    false,
  );
  await assert.rejects(financial(sql, "sara"));
  await assert.rejects(feeWorkspace(sql, "sara"));
  await assert.rejects(financeWorkspace(sql, "sara"));
  await sql`update organization_operational_access set status='suspended' where user_id='sara'`;
  await assert.rejects(organizationWorkspace(sql, "sara"));
  await assert.rejects(financial(sql, "sara"));
  assert.equal(club.teams[0].id, team.id);
});

test("captured parent-role coaches retain only their previously effective pay access", async () => {
  const { sql, club, team } = await fixture();
  await sql`update profiles set role='parent' where user_id='coach'`;
  await capture(sql);
  await activate(sql);
  const me = { ...coach, role: "coach" as const };
  const legacy = scopeClub(club, "coach", me).teams[0].staff.find((s) => s.email === coach.email)!;
  await withFinancialContext(sql, "coach", "read", async (_tx, c) => {
    assert.equal(c.principal.role, "parent");
    assert.equal(
      teamFinancialView(c, "coach")!.staff.find((s) => s.id === legacy.id)!.monthly,
      legacy.monthly,
    );
    assert.equal(teamFinancialView(c, "coach")!.obligations.length, 0);
    assert.equal(teamFinancialView(c, "family")!.staff.length, 0);
  });
  const changed = structuredClone(club);
  changed.teams[0].coachEmail = "parent@example.invalid";
  changed.teams[0].staff = [];
  await sql`update club_state set payload=${JSON.stringify(changed)}::jsonb where id='oklahoma-prospects'`;
  await withFinancialContext(sql, "coach", "read", async (_tx, c) =>
    assert.equal(teamFinancialView(c, "coach")!.staff[0].monthly, legacy.monthly),
  );
  await withFinancialContext(sql, "parent", "read", async (_tx, c) =>
    assert.equal(
      teamFinancialView(c, "coach")!.coachTeams.some((t) => t.teamId === team.id),
      false,
    ),
  );
});
