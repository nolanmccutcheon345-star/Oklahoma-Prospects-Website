import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import {
  organizationWorkspace,
  saveOrganizationTeam,
  saveOrganizationPlayer,
  saveOrganizationStaff,
  moveOrganizationPlayer,
  saveOrganizationRegistration,
  saveOrganizationEvaluation,
  reviewOrganizationEvaluation,
  saveOrganizationActivity,
  organizationOccupancy,
  sendOrganizationMessage,
} from "./organization.server";
import {
  organizationTeamInput,
  organizationPlayerInput,
  organizationStaffInput,
  organizationRegistrationInput,
  organizationEvaluationInput,
  organizationActivityInput,
} from "./organization-contracts";
import { blankEvaluationPayload } from "../tryout-evaluation-contracts";

type Json = Record<string, unknown>;
const CANARY = "PRIVATE-FINANCIAL-CANARY";
const AMOUNT = 91827345;
async function fixture() {
  const db = new PGlite();
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${name}`, "utf8"));
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, values: unknown[] = []) =>
      (await query(q, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  for (const id of ["steve", "sara", "outsider", "coach"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${id === "steve" ? "admin" : id === "coach" ? "coach" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  const club = sampleClub();
  // Explicit zero-cost fallback for tests exercising truly unlinked roster operations.
  club.settings.membershipMonthly = 0;
  club.settings.orgFeeFloor = 0;
  club._demo = false;
  club._rev = 1;
  club.teams = [
    structuredClone(club.teams[0]),
    structuredClone(club.teams[0]),
    structuredClone(club.teams[1]),
  ];
  club.teams.forEach((t, i) => {
    t.id = ["base", "base2", "soft"][i];
    t.sport = i === 2 ? "softball" : "baseball";
    t.name = `Test ${t.id}`;
    t.age = "12U";
    t.closed = false;
    t.coachEmail = "coach@example.invalid";
    t.roster = t.roster.slice(0, 1);
    t.roster[0].id = `${t.id}-player`;
    t.roster[0].teamId = t.id;
    t.roster[0].withdrawn = false;
    t.roster[0].number = String(i + 1);
    const player = t.roster[0] as unknown as Json;
    player.financeFuture = { balance: AMOUNT, memo: CANARY };
    player.parents = [
      {
        name: "Test Guardian",
        rel: "guardian",
        email: "guardian@example.invalid",
        phone: "5550100",
        finance: { memo: CANARY, amount: AMOUNT },
      },
    ];
    player.docs = {
      waiver: false,
      birthCert: true,
      insurance: true,
      physical: false,
      invoice: CANARY,
    };
    player.payments = [{ amount: AMOUNT, label: CANARY }];
    t.notes = CANARY;
    t.messages = [{ id: randomUUID(), from: "Owner", at: "2026-01-01", body: CANARY }];
    t.announcements = [
      {
        id: randomUUID(),
        title: CANARY,
        body: CANARY,
        pin: false,
        arrive: "",
        uniform: "",
        hotel: "",
      },
    ];
    t.staff = [
      {
        id: `${t.id}-staff`,
        name: "Coach",
        role: "Assistant coach",
        email: "coach@example.invalid",
        monthly: AMOUNT,
        applyAmount: AMOUNT,
        childId: "",
        w9: true,
        backgroundCheck: true,
        safeSport: false,
        expires: "2027-01-01",
      },
    ];
    (t.staff[0] as unknown as Json).financeFuture = CANARY;
  });
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  await sql`insert into club_requests(id,kind,payload) values('request','tryout',${JSON.stringify({ player: "Test Prospect", parent: "Guardian", email: "family@example.invalid", sport: "Baseball", age: "12U", positions: "P", preferredTeamId: "base", notes: CANARY, payment: { amount: AMOUNT }, futureFinancialField: CANARY })}::jsonb)`;
  const evaluationId = randomUUID(),
    activityId = randomUUID();
  const evaluation = {
    ...blankEvaluationPayload(),
    strengths: CANARY,
    financeFuture: CANARY,
    ratings: { ...blankEvaluationPayload().ratings, invoice: CANARY },
  };
  await sql`insert into tryout_evaluations(id,registration_id,team_id,evaluator_id,evaluator_name,player_name,age_group,sport,evaluation_date,status,recommendation,payload) values(${evaluationId},'request','base','coach','Coach','Test Prospect','12U','baseball','2026-10-01','draft','undecided',${JSON.stringify(evaluation)}::jsonb)`;
  await sql`insert into team_activities(id,team_id,updated_by,payload) values(${activityId},'base','steve',${JSON.stringify({ id: activityId, teamId: "base", kind: "game", title: "Test game", date: "2027-10-20", startTime: "16:00", endTime: "17:00", location: "Test field", status: "scheduled", entryFee: AMOUNT, invoice: CANARY, stats: [], ourRuns: 0, oppRuns: 0 })}::jsonb)`;
  return { db, sql, evaluationId, activityId };
}
const clubFor = async (sql: Sql) =>
  (
    await sql<{
      payload: {
        teams: (Json & { roster: Json[]; staff: Json[] })[];
        settings: Json;
        uniforms: Json[];
      };
      rev: number;
    }>`select payload,rev from club_state where id='oklahoma-prospects'`
  )[0];
const ratings = {
  contact: 3,
  approach: 4,
  fielding: 3,
  throwing: 4,
  movement: 3,
  knowledge: 4,
  coachability: 5,
};
function assertNoFinance(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.ok(!serialized.includes(CANARY));
  assert.ok(!serialized.includes(String(AMOUNT)));
  const forbidden = new Set([
    "feeLock",
    "planLock",
    "payments",
    "cards",
    "credits",
    "depositPaid",
    "monthly",
    "applyAmount",
    "w9",
    "coachChild",
    "roleType",
    "orgFee",
    "eventBudget",
    "otherCosts",
    "entryFee",
    "financialClearance",
    "financeFuture",
    "notes",
    "body",
    "strengths",
    "evidence",
    "agreement",
    "clearance",
    "fundingPlayers",
  ]);
  function walk(v: unknown) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, child] of Object.entries(v)) {
        assert.ok(!forbidden.has(k), `Forbidden response key: ${k}`);
        walk(child);
      }
  }
  walk(value);
}

test("organization operational workspace is explicitly projected, cross-sport, and revocable", async () => {
  const { db, sql } = await fixture();
  try {
    const view = await organizationWorkspace(sql, "steve");
    assert.equal(view.teams.length, 3);
    assert.equal(view.teams[2].sport, "softball");
    assert.equal(view.teams[0].roster[0].parents[0].email, "guardian@example.invalid");
    assert.deepEqual(Object.keys(view.teams[0].roster[0].docs).sort(), [
      "birthCert",
      "insurance",
      "physical",
      "waiver",
    ]);
    assertNoFinance(view);
    assertNoFinance(await organizationWorkspace(sql, "steve"));
    await assert.rejects(() => organizationWorkspace(sql, "outsider"));
    await sql`update organization_operational_access set status='suspended' where user_id='sara'`;
    await assert.rejects(() => organizationWorkspace(sql, "sara"));
    await sql`update organization_operational_access set status='active' where user_id='sara'`;
    await sql`update "user" set "emailVerified"=false where id='sara'`;
    await assert.rejects(() => organizationWorkspace(sql, "sara"));
  } finally {
    await db.close();
  }
});

test("strict mutation schemas reject all financial, permission, and nested injected fields", () => {
  const writes = [
    [
      organizationTeamInput,
      { revision: 1, teamId: "base", changes: { name: "Renamed", orgFee: 1 } },
    ],
    [
      organizationPlayerInput,
      { revision: 1, teamId: "base", playerId: "base-player", changes: { payments: [] } },
    ],
    [
      organizationPlayerInput,
      {
        revision: 1,
        teamId: "base",
        playerId: "base-player",
        changes: { docs: { waiver: true, balance: 1 } },
      },
    ],
    [
      organizationPlayerInput,
      {
        revision: 1,
        teamId: "base",
        playerId: "base-player",
        changes: {
          parents: [
            { name: "A", rel: "guardian", email: "a@example.invalid", phone: "", bank: "secret" },
          ],
        },
      },
    ],
    [
      organizationStaffInput,
      { revision: 1, teamId: "base", staffId: "staff", changes: { monthly: 5 } },
    ],
    [
      organizationRegistrationInput,
      { id: "request", revision: 0, workRevision: 0, changes: { amount: 1 } },
    ],
    [
      organizationEvaluationInput,
      {
        id: randomUUID(),
        revision: 0,
        registrationId: null,
        teamId: "base",
        playerName: "A",
        ageGroup: "12U",
        sport: "baseball",
        evaluationDate: "2026-10-01",
        status: "draft",
        recommendation: "undecided",
        ratings: { ...ratings, amount: 99 },
      },
    ],
    [
      organizationActivityInput,
      {
        id: randomUUID(),
        revision: 0,
        teamId: "base",
        kind: "game",
        title: "Game",
        date: "2027-01-01",
        startTime: "16:00",
        endTime: "17:00",
        location: "Field",
        status: "scheduled",
        entryFee: 1,
      },
    ],
    [
      organizationTeamInput,
      { revision: 1, teamId: "base", changes: { permissions: ["*"], role: "admin" } },
    ],
  ] as const;
  for (const [schema, value] of writes) assert.equal(schema.safeParse(value).success, false);
});

test("operational CRUD preserves mixed records and enforces revisions, audit, and self-assignment boundaries", async () => {
  const { db, sql } = await fixture();
  try {
    const before = await clubFor(sql),
      original = before.payload.teams[0];
    await saveOrganizationPlayer(sql, "steve", {
      revision: 1,
      teamId: "base",
      playerId: "base-player",
      changes: {
        number: "99",
        parents: [
          {
            name: "Updated Guardian",
            rel: "guardian",
            phone: "5550200",
            email: "guardian@example.invalid",
          },
        ],
        docs: { waiver: true },
      },
    });
    let current = await clubFor(sql);
    const player = current.payload.teams[0].roster[0];
    for (const key of [
      "feeLock",
      "planLock",
      "payments",
      "cards",
      "credits",
      "depositPaid",
      "financeFuture",
    ])
      assert.deepEqual(player[key], original.roster[0][key]);
    assert.deepEqual(
      (player.parents as Json[])[0].finance,
      (original.roster[0].parents as Json[])[0].finance,
    );
    assert.equal((player.docs as Json).invoice, CANARY);
    await assert.rejects(
      () =>
        saveOrganizationPlayer(sql, "steve", {
          revision: 1,
          teamId: "base",
          playerId: "base-player",
          changes: { number: "98" },
        }),
      /changed/,
    );
    await assert.rejects(
      () =>
        saveOrganizationPlayer(sql, "steve", {
          revision: 2,
          teamId: "base",
          playerId: "base-player",
          changes: { parents: [] },
        }),
      /Guardian rows/,
    );
    await saveOrganizationStaff(sql, "steve", {
      revision: 2,
      teamId: "base",
      staffId: "base-staff",
      changes: { safeSport: true },
    });
    current = await clubFor(sql);
    assert.equal(current.payload.teams[0].staff[0].monthly, AMOUNT);
    assert.equal(current.payload.teams[0].staff[0].financeFuture, CANARY);
    await assert.rejects(() =>
      saveOrganizationStaff(sql, "steve", {
        revision: 3,
        teamId: "base",
        staffId: "base-staff",
        changes: { email: "sara@example.invalid" },
      }),
    );
    await assert.rejects(() =>
      saveOrganizationTeam(sql, "steve", {
        revision: 3,
        teamId: "base",
        changes: { coachEmail: "sara@example.invalid" },
      }),
    );
    await saveOrganizationTeam(sql, "steve", {
      revision: 3,
      teamId: "soft",
      changes: { name: "Updated softball" },
    });
    current = await clubFor(sql);
    assert.equal(current.payload.teams[2].name, "Updated softball");
    for (const key of ["orgFee", "coachMonthly", "eventBudget", "otherCosts"])
      assert.deepEqual(current.payload.teams[0][key], original[key]);
    assertNoFinance(await organizationWorkspace(sql, "steve"));
    const audit = await sql<{
      action: string;
      result: string;
      details: unknown;
    }>`select action,result,details from coordinator_audit where actor_id='steve'`;
    assert.ok(audit.some((r) => r.action === "organization.player.save" && r.result === "allowed"));
    assert.ok(audit.some((r) => r.result === "conflict"));
    await assert.rejects(() => organizationWorkspace(sql, "sara"));
    assert.equal(
      (
        await sql`select count(*)::int as n from coordinator_audit where actor_id='sara' and result='denied'`
      )[0].n,
      1,
    );
    assert.ok(!JSON.stringify(audit).includes(CANARY));
  } finally {
    await db.close();
  }
});

test("new operational records and safe team transfers work without modifying stored finances", async () => {
  const { db, sql } = await fixture();
  try {
    const a = randomUUID(),
      b = randomUUID(),
      playerId = randomUUID(),
      staffId = randomUUID();
    await saveOrganizationTeam(sql, "steve", {
      revision: 1,
      teamId: a,
      changes: { name: "New A", sport: "baseball", age: "12U" },
    });
    await saveOrganizationTeam(sql, "steve", {
      revision: 2,
      teamId: b,
      changes: { name: "New B", sport: "baseball", age: "12U" },
    });
    await saveOrganizationPlayer(sql, "steve", {
      revision: 3,
      teamId: a,
      playerId,
      changes: {
        name: "New Player",
        parents: [{ name: "Guardian", rel: "guardian", email: "test@example.invalid", phone: "" }],
      },
    });
    await saveOrganizationStaff(sql, "steve", {
      revision: 4,
      teamId: b,
      staffId,
      changes: { name: "New coach", email: "othercoach@example.invalid" },
    });
    const before = await clubFor(sql),
      p = before.payload.teams.find((t) => t.id === a)!.roster[0];
    await moveOrganizationPlayer(sql, "steve", {
      revision: 5,
      teamId: a,
      playerId,
      destinationTeamId: b,
    });
    const after = await clubFor(sql);
    assert.equal(after.payload.teams.find((t) => t.id === a)!.roster.length, 0);
    assert.deepEqual(after.payload.teams.find((t) => t.id === b)!.roster[0], { ...p, teamId: b });
    await assert.rejects(
      () =>
        moveOrganizationPlayer(sql, "steve", {
          revision: 6,
          teamId: "base",
          playerId: "base-player",
          destinationTeamId: "base2",
        }),
      /protected roster workflow/,
    );
    assert.deepEqual((await clubFor(sql)).payload, after.payload);
  } finally {
    await db.close();
  }
});

test("registrations, evaluations, and schedules support safe mutations without exposing or overwriting mixed payloads", async () => {
  const { db, sql, evaluationId, activityId } = await fixture();
  try {
    await saveOrganizationRegistration(sql, "steve", {
      id: "request",
      revision: 0,
      workRevision: 0,
      changes: { positions: "OF" },
      workflow: {
        teamId: "base",
        assigneeId: "steve",
        status: "offered",
        followUpDate: "2027-01-01",
      },
    });
    const [request] = await sql<{
      payload: Json;
    }>`select payload from club_requests where id='request'`;
    assert.equal(request.payload.notes, CANARY);
    assert.equal(request.payload.futureFinancialField, CANARY);
    await assert.rejects(
      () =>
        saveOrganizationRegistration(sql, "steve", {
          id: "request",
          revision: 0,
          workRevision: 0,
          changes: { positions: "P" },
        }),
      /changed/,
    );
    await saveOrganizationRegistration(sql, "steve", {
      id: randomUUID(),
      revision: 0,
      workRevision: 0,
      changes: {
        kind: "team-inquiry",
        player: "New Prospect",
        parent: "Guardian",
        email: "new@example.invalid",
        sport: "softball",
        age: "12U",
        preferredTeamId: "soft",
      },
    });
    await saveOrganizationEvaluation(sql, "steve", {
      id: evaluationId,
      revision: 1,
      registrationId: "request",
      teamId: "base",
      playerName: "Test Prospect",
      ageGroup: "12U",
      sport: "baseball",
      evaluationDate: "2026-10-01",
      status: "submitted",
      recommendation: "invite",
      ratings,
    });
    await reviewOrganizationEvaluation(sql, "steve", { id: evaluationId, revision: 2 });
    const [evaluation] = await sql<{
      payload: Json;
      evaluator_id: string;
    }>`select payload,evaluator_id from tryout_evaluations where id=${evaluationId}`;
    assert.equal(evaluation.payload.strengths, CANARY);
    assert.equal(evaluation.payload.financeFuture, CANARY);
    assert.equal((evaluation.payload.ratings as Json).invoice, CANARY);
    assert.equal(evaluation.evaluator_id, "coach");
    await assert.rejects(
      () =>
        saveOrganizationActivity(sql, "steve", {
          id: activityId,
          revision: 1,
          teamId: "base",
          kind: "game",
          title: "Blocked financial activity",
          date: "2027-10-21",
          startTime: "16:00",
          endTime: "17:00",
          location: "Other field",
          status: "scheduled",
          laneIds: [],
        }),
      /protected workflow/,
    );
    await saveOrganizationActivity(sql, "steve", {
      id: randomUUID(),
      revision: 0,
      teamId: "base",
      kind: "game",
      title: "Rescheduled game",
      date: "2027-10-21",
      startTime: "16:00",
      endTime: "17:00",
      location: "Other field",
      status: "scheduled",
      laneIds: [],
    });
    const [activity] = await sql<{
      payload: Json;
    }>`select payload from team_activities where id=${activityId}`;
    assert.equal(activity.payload.entryFee, AMOUNT);
    assert.equal(activity.payload.invoice, CANARY);
    assertNoFinance(await organizationWorkspace(sql, "steve"));
  } finally {
    await db.close();
  }
});

test("cage reservations use shared occupancy, conflict rolls back, cancellation releases cells, and sends are idempotent", async () => {
  const { db, sql } = await fixture();
  try {
    const id = randomUUID(),
      second = randomUUID();
    const data = {
      id,
      revision: 0,
      teamId: "base",
      kind: "practice" as const,
      title: "Practice",
      date: "2099-10-20",
      startTime: "16:00",
      endTime: "17:00",
      location: "Facility",
      status: "scheduled" as const,
      laneIds: ["1" as const],
    };
    await saveOrganizationActivity(sql, "steve", data);
    const occupied = await organizationOccupancy(sql, "steve", data.date);
    assert.equal(occupied.length, 12);
    assert.deepEqual(Object.keys(occupied[0]).sort(), ["at", "resourceId"]);
    await assert.rejects(
      () => saveOrganizationActivity(sql, "steve", { ...data, id: second, teamId: "soft" }),
      /reserved/,
    );
    assert.equal((await sql`select id from team_activities where id=${second}`).length, 0);
    await saveOrganizationActivity(sql, "steve", { ...data, revision: 1, status: "cancelled" });
    assert.equal((await organizationOccupancy(sql, "steve", data.date)).length, 0);
    const message = {
      id: randomUUID(),
      teamId: "soft",
      confirmedTeamId: "soft",
      body: "Practice starts at four.",
    };
    await sendOrganizationMessage(sql, "steve", message);
    await sendOrganizationMessage(sql, "steve", message);
    assert.equal((await sql`select id from team_chat_messages where id=${message.id}`).length, 1);
    await assert.rejects(
      () => sendOrganizationMessage(sql, "steve", { ...message, body: "Different text" }),
      /changed/,
    );
    await assert.rejects(
      () =>
        sendOrganizationMessage(sql, "steve", {
          ...message,
          id: randomUUID(),
          confirmedTeamId: "base",
        }),
      /Confirm/,
    );
    assertNoFinance(await organizationWorkspace(sql, "steve"));
  } finally {
    await db.close();
  }
});

test("financially coupled operations fail closed without changing terms, payees, billing identities, or collectible state", async () => {
  const { db, sql, activityId } = await fixture();
  try {
    const before = await clubFor(sql);
    const blocked = [
      () =>
        saveOrganizationTeam(sql, "steve", {
          revision: 1,
          teamId: "base",
          changes: { coachEmail: "other@example.invalid" },
        }),
      () =>
        saveOrganizationTeam(sql, "steve", {
          revision: 1,
          teamId: "base",
          changes: { headCoach: "New Payee" },
        }),
      () =>
        saveOrganizationTeam(sql, "steve", {
          revision: 1,
          teamId: "base",
          changes: { seasonStart: "2027-03-01" },
        }),
      () =>
        saveOrganizationTeam(sql, "steve", {
          revision: 1,
          teamId: "base",
          changes: { closed: true },
        }),
      () =>
        saveOrganizationStaff(sql, "steve", {
          revision: 1,
          teamId: "base",
          staffId: randomUUID(),
          changes: { name: "New Coach", role: "Assistant coach" },
        }),
      () =>
        saveOrganizationStaff(sql, "steve", {
          revision: 1,
          teamId: "base",
          staffId: "base-staff",
          changes: { email: "newcoach@example.invalid" },
        }),
      () =>
        saveOrganizationStaff(sql, "steve", {
          revision: 1,
          teamId: "base",
          staffId: "base-staff",
          changes: { role: "Head coach" },
        }),
      () =>
        saveOrganizationPlayer(sql, "steve", {
          revision: 1,
          teamId: "base",
          playerId: "base-player",
          changes: { withdrawn: true },
        }),
      () =>
        saveOrganizationPlayer(sql, "steve", {
          revision: 1,
          teamId: "base",
          playerId: "base-player",
          changes: { email: "newathlete@example.invalid" },
        }),
      () =>
        saveOrganizationPlayer(sql, "steve", {
          revision: 1,
          teamId: "base",
          playerId: "base-player",
          changes: {
            parents: [
              {
                name: "Guardian",
                rel: "guardian",
                phone: "",
                email: "newguardian@example.invalid",
              },
            ],
          },
        }),
      () =>
        saveOrganizationActivity(sql, "steve", {
          id: activityId,
          revision: 1,
          teamId: "base",
          kind: "game",
          title: "Test game",
          date: "2027-10-20",
          startTime: "16:00",
          endTime: "17:00",
          location: "Test field",
          status: "cancelled",
          laneIds: [],
        }),
    ];
    for (const action of blocked) await assert.rejects(action, /protected workflow/);
    assert.deepEqual(await clubFor(sql), before);
    const [activity] = await sql<{
      payload: Json;
    }>`select payload from team_activities where id=${activityId}`;
    assert.equal(activity.payload.status, "scheduled");
    assert.equal(activity.payload.entryFee, AMOUNT);
    // A fee plan is sufficient protection even when all legacy team fields are zero.
    const teamId = randomUUID();
    await saveOrganizationTeam(sql, "steve", {
      revision: 1,
      teamId,
      changes: { name: "Plan-linked team", sport: "softball" },
    });
    const plan = { invoice: CANARY, amount: AMOUNT };
    await sql`insert into team_fee_plans(team_id,payload) values(${teamId},${JSON.stringify(plan)}::jsonb)`;
    await assert.rejects(
      () =>
        saveOrganizationStaff(sql, "steve", {
          revision: 2,
          teamId,
          staffId: randomUUID(),
          changes: { name: "Coach" },
        }),
      /protected workflow/,
    );
    await assert.rejects(
      () =>
        saveOrganizationActivity(sql, "steve", {
          id: randomUUID(),
          revision: 0,
          teamId,
          kind: "tournament",
          title: "Tournament",
          date: "2027-10-20",
          startTime: "16:00",
          endTime: "17:00",
          location: "Field",
          status: "scheduled",
          laneIds: [],
        }),
      /protected workflow/,
    );
    assert.deepEqual(
      (await sql<{ payload: Json }>`select payload from team_fee_plans where team_id=${teamId}`)[0]
        .payload,
      plan,
    );
    assertNoFinance(await organizationWorkspace(sql, "steve"));
  } finally {
    await db.close();
  }
});

test("normalized operational flags preserve legacy stored timestamps during unrelated edits", async () => {
  const { db, sql } = await fixture();
  try {
    const { payload } = await clubFor(sql);
    payload.teams[0].closed = null;
    payload.teams[0].staff[0].backgroundCheck = "2026-09-01";
    payload.teams[0].staff[0].safeSport = "2026-09-02";
    await sql`update club_state set payload=${JSON.stringify(payload)}::jsonb where id='oklahoma-prospects'`;
    const view = await organizationWorkspace(sql, "steve");
    assert.equal(view.teams[0].staff[0].backgroundCheck, true);
    await saveOrganizationTeam(sql, "steve", {
      revision: 1,
      teamId: "base",
      changes: { name: "Renamed", closed: false },
    });
    await saveOrganizationStaff(sql, "steve", {
      revision: 2,
      teamId: "base",
      staffId: "base-staff",
      changes: { backgroundCheck: true, safeSport: true, expires: "2028-01-01" },
    });
    const after = await clubFor(sql);
    assert.equal(after.payload.teams[0].closed, null);
    assert.equal(after.payload.teams[0].staff[0].backgroundCheck, "2026-09-01");
    assert.equal(after.payload.teams[0].staff[0].safeSport, "2026-09-02");
  } finally {
    await db.close();
  }
});

test("new player creation is blocked for financially linked teams and allowed for an empty unlinked team", async () => {
  const { db, sql } = await fixture();
  try {
    const before = await clubFor(sql);
    const blockedId = randomUUID();
    await assert.rejects(
      () =>
        saveOrganizationPlayer(sql, "steve", {
          revision: before.rev,
          teamId: "base",
          playerId: blockedId,
          changes: {
            name: "Blocked Prospect",
            parents: [
              { name: "Guardian", rel: "guardian", email: "new@example.invalid", phone: "" },
            ],
          },
        }),
      /protected workflow/,
    );
    assert.deepEqual(await clubFor(sql), before);
    assert.equal(
      (await organizationWorkspace(sql, "steve")).teams
        .flatMap((t) => t.roster)
        .some((p) => p.id === blockedId),
      false,
    );
    const emptyTeamId = randomUUID(),
      allowedId = randomUUID();
    await saveOrganizationTeam(sql, "steve", {
      revision: before.rev,
      teamId: emptyTeamId,
      changes: { name: "Unlinked team", sport: "baseball", age: "12U" },
    });
    await saveOrganizationPlayer(sql, "steve", {
      revision: before.rev + 1,
      teamId: emptyTeamId,
      playerId: allowedId,
      changes: { name: "Allowed Prospect" },
    });
    const allowed = await clubFor(sql);
    assert.equal(allowed.payload.teams.find((t) => t.id === emptyTeamId)?.roster[0].id, allowedId);
    assert.deepEqual(
      allowed.payload.teams.slice(0, before.payload.teams.length),
      before.payload.teams,
    );
    // A plan alone also blocks additions when all legacy money fields are zero.
    await sql`insert into team_fee_plans(team_id,payload) values(${emptyTeamId},${JSON.stringify({ financialCanary: CANARY, amount: AMOUNT })}::jsonb)`;
    await assert.rejects(
      () =>
        saveOrganizationPlayer(sql, "steve", {
          revision: allowed.rev,
          teamId: emptyTeamId,
          playerId: randomUUID(),
          changes: { name: "Plan-linked prospect" },
        }),
      /protected workflow/,
    );
    assert.deepEqual(await clubFor(sql), allowed);
    const [audit] = await sql<{
      count: number;
    }>`select count(*)::int as count from coordinator_audit where actor_id='steve' and action='organization.player.save' and result='conflict'`;
    assert.equal(audit.count, 2);
  } finally {
    await db.close();
  }
});

test("an uncommitted player cannot move when either team has a financially linked teammate", async () => {
  const { db, sql } = await fixture();
  try {
    const sourceId = randomUUID(),
      destinationId = randomUUID(),
      playerId = randomUUID();
    await saveOrganizationTeam(sql, "steve", {
      revision: 1,
      teamId: sourceId,
      changes: { name: "Source", sport: "baseball", age: "12U" },
    });
    await saveOrganizationTeam(sql, "steve", {
      revision: 2,
      teamId: destinationId,
      changes: { name: "Destination", sport: "baseball", age: "12U" },
    });
    await saveOrganizationPlayer(sql, "steve", {
      revision: 3,
      teamId: sourceId,
      playerId,
      changes: { name: "Uncommitted player" },
    });
    const baseline = await clubFor(sql);
    const movingPlayer = baseline.payload.teams.find((t) => t.id === sourceId)!.roster[0];
    for (const linkedTeamId of [sourceId, destinationId]) {
      const state = structuredClone(baseline);
      state.payload.teams
        .find((t) => t.id === linkedTeamId)!
        .roster.push({
          ...movingPlayer,
          id: randomUUID(),
          teamId: linkedTeamId,
          name: "Committed teammate",
          payments: [{ amount: AMOUNT, label: CANARY }],
        });
      await sql`update club_state set payload=${JSON.stringify(state.payload)}::jsonb where id='oklahoma-prospects'`;
      await assert.rejects(
        () =>
          moveOrganizationPlayer(sql, "steve", {
            revision: state.rev,
            teamId: sourceId,
            playerId,
            destinationTeamId: destinationId,
          }),
        /protected roster workflow/,
      );
      assert.deepEqual(await clubFor(sql), state);
    }
  } finally {
    await db.close();
  }
});

test("unlocked roster operations preserve membership, fee-floor and uniform-derived quotes", async () => {
  const { db, sql } = await fixture();
  try {
    const sourceId = randomUUID(),
      destinationId = randomUUID(),
      playerId = randomUUID();
    await saveOrganizationTeam(sql, "steve", {
      revision: 1,
      teamId: sourceId,
      changes: { name: "Zero-cost source", sport: "baseball", age: "12U" },
    });
    await saveOrganizationTeam(sql, "steve", {
      revision: 2,
      teamId: destinationId,
      changes: { name: "Zero-cost destination", sport: "baseball", age: "12U" },
    });
    await saveOrganizationPlayer(sql, "steve", {
      revision: 3,
      teamId: sourceId,
      playerId,
      changes: { name: "Unsigned player" },
    });
    const baseline = await clubFor(sql);
    for (const determinant of ["membership", "floor", "uniform", "invalid"] as const) {
      const state = structuredClone(baseline);
      if (determinant === "membership") state.payload.settings.membershipMonthly = 200;
      if (determinant === "floor") state.payload.settings.orgFeeFloor = 300;
      if (determinant === "uniform") {
        const pack = state.payload.uniforms[0];
        pack.price = 325;
        state.payload.teams.find((t) => t.id === sourceId)!.uniformPackageId = pack.id;
      }
      if (determinant === "invalid") state.payload.settings.fundingPlayers = 0;
      await sql`update club_state set payload=${JSON.stringify(state.payload)}::jsonb where id='oklahoma-prospects'`;
      await assert.rejects(
        () =>
          saveOrganizationPlayer(sql, "steve", {
            revision: state.rev,
            teamId: sourceId,
            playerId: randomUUID(),
            changes: { name: "New player" },
          }),
        /protected workflow/,
      );
      await assert.rejects(
        () =>
          saveOrganizationPlayer(sql, "steve", {
            revision: state.rev,
            teamId: sourceId,
            playerId,
            changes: { withdrawn: true },
          }),
        /protected workflow/,
      );
      await assert.rejects(
        () =>
          moveOrganizationPlayer(sql, "steve", {
            revision: state.rev,
            teamId: sourceId,
            playerId,
            destinationTeamId: destinationId,
          }),
        /protected roster workflow/,
      );
      assert.deepEqual(await clubFor(sql), state, determinant);
    }
  } finally {
    await db.close();
  }
});
