import { requireGrant, secured } from './access.server';
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { permissionKeys, assignmentInput, type AssignmentInput, type Capability } from "./contracts";
import { saveAssignment, staffWorkspace, saveLeadership } from "./admin.server";
import {
  coordinatorHome,
  roster,
  editRoster,
  recruiting,
  createProspect,
  editRequest,
  operationalReports,
  postTeamMessage,
  sendRecruitingEmail,
} from "./operations.server";
import { savePractice, schedules, cageOccupancy } from "./scheduling.server";
import { saveDraft, requestApproval, decideApproval } from "./governance.server";
import { publicPeopleFor } from "../person-public.server";
import { registrationRowsFor } from "../registrations.server";
import { frontOfficeFor } from "../front-office.server";
async function fixture() {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const s = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await query(
          p.reduce((a, b, i) => a + (i ? "$" + i : "") + b, ""),
          v,
        )
      ).rows) as Sql;
    s.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
    s.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return s;
  };
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = wrap(db.query.bind(db));
  for (const id of [
    "owner",
    "baseball",
    "softball",
    "zero",
    "coach",
    "parent",
    "instructor",
    "fake",
    "legacy",
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role) values(${id},${id + "@example.invalid"},${id},${id === "owner" || id === "fake" ? "admin" : id === "coach" ? "coach" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  for (const c of ["staff_roles.manage", "staff_activity.read", "staff_approvals.review"])
    await sql`insert into staff_authorities values('owner@example.invalid',${c})`;
  await sql`insert into person_profiles(user_id,instructor) values('instructor',true)`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = club.teams.slice(0, 2);
  club.teams.forEach((t, i) => {
    t.id = i ? "soft" : "base";
    t.sport = i ? "softball" : "baseball";
    t.name = i ? "Softball Test" : "Baseball Test";
    t.closed = false;
    t.coachEmail = "coach@example.invalid";
    t.roster = t.roster.slice(0, 1);
    t.roster[0].id = i ? "soft-player" : "base-player";
    t.roster[0].withdrawn = false;
    t.roster[0].emergency.conditions = "PRIVATE-MEDICAL";
    t.roster[0].parents = [
      { name: "Guardian", email: "guardian@example.invalid", phone: "5550000000", rel: "parent" },
    ];
    t.roster[0].payments = [
      {
        date: "2026-01-01",
        amount: 98765,
        fee: 0,
        charged: 98765,
        method: "card",
        label: "PRIVATE-PAYMENT",
        receipt: "private",
      },
    ];
  });
  await sql`insert into club_state(id,rev,demo,payload) values('oklahoma-prospects',1,false,${JSON.stringify(club)}::jsonb)`;
  const assign = async (
    userId: string,
    sport: "baseball" | "softball",
    permissions: Capability[] = [],
    coverage: "sport" | "teams" = "sport",
    teamIds: string[] = [],
  ) => {
    const [old] = await sql<{
      revision: number;
    }>`select revision from coordinator_assignments where user_id=${userId} and sport=${sport}`;
    const input: AssignmentInput = {
      userId,
      sport,
      revision: old?.revision || 0,
      status: "active",
      coverage,
      teamIds,
      permissions: [],
      confirm: true,
      independentRolesReviewed: true,
    };
    if (!old) {
      await saveAssignment(sql, "owner", input);
      input.revision = 1;
    }
    if (permissions.length) {
      input.permissions = permissions;
      await saveAssignment(sql, "owner", input);
      input.revision++;
    }
    return input;
  };
  return { db, sql, assign };
}
test("coordinator default-deny matrix, field projections, scopes, revisions, and revocation", async () => {
  const { db, sql, assign } = await fixture();
  try {
    for (const user of ["zero", "softball", "baseball"])
      await assign(user, user === "baseball" ? "baseball" : "softball");
    assert.equal((await coordinatorHome(sql, "zero")).targets.length, 0);
    for (const permission of permissionKeys) await assert.rejects(() => secured(sql, 'zero', permission, tx => requireGrant(tx, 'zero', permission, 'softball', 'soft')));
    await assign('baseball','baseball',['rosters.read']);
    await assert.rejects(()=>roster(sql,'baseball','soft'));
    assert.equal((await roster(sql,'baseball','base')).length,1);
    await assign('baseball','softball');
    await assert.rejects(()=>roster(sql,'baseball','soft'));
    await assign('baseball','softball',['rosters.read']);
    assert.equal((await roster(sql,'baseball','soft')).length,1);

    await assert.rejects(() => registrationRowsFor(sql, "zero"));
    for (const user of ["zero", "parent", "coach", "instructor", "fake"]) {
      await assert.rejects(() => roster(sql, user, "soft"));
      await assert.rejects(() => staffWorkspace(sql, user));
      await assert.rejects(() => frontOfficeFor(sql, user));
    }
    for (const permission of [
      "finance.read",
      "staff_roles.manage",
      "medical.read",
      "athletes.delete",
      "contacts.export",
      "*",
    ]) {
      assert.equal(
        assignmentInput.safeParse({
          userId: "zero",
          sport: "softball",
          revision: 1,
          status: "active",
          coverage: "sport",
          teamIds: [],
          permissions: [permission],
          confirm: true,
          independentRolesReviewed: true,
        }).success,
        false,
      );
      await assert.rejects(
        () =>
          sql`update coordinator_assignments set permissions=${[permission]} where user_id='zero'`,
      );
    }
    await assign("softball", "softball", ["rosters.read", "recruiting.read", "reports.read"]);
    const before = await roster(sql, "softball", "soft");
    assert.equal(before.length, 1);
    assert.equal(before[0].parents.length, 0);
    assert.doesNotMatch(
      JSON.stringify(before),
      /PRIVATE|payments|emergency|birth|98765|guardian@example/,
    );
    await assert.rejects(() => roster(sql, "softball", "base"));
    await assert.rejects(() =>
      editRoster(sql, "softball", {
        teamId: "soft",
        playerId: "soft-player",
        revision: 1,
        field: "number",
        value: "99",
      }),
    );
    await assert.rejects(() =>
      saveAssignment(sql, "softball", {
        userId: "softball",
        sport: "softball",
        revision: 2,
        status: "active",
        coverage: "sport",
        teamIds: [],
        permissions: ["rosters.number"],
        confirm: true,
        independentRolesReviewed: true,
      }),
    );
    const input = await assign("softball", "softball", [
      "rosters.read",
      "rosters.number",
      "contacts.read",
    ]);
    assert.equal(
      (await roster(sql, "softball", "soft"))[0].parents[0].email,
      "guardian@example.invalid",
    );
    await editRoster(sql, "softball", {
      teamId: "soft",
      playerId: "soft-player",
      revision: 1,
      field: "number",
      value: "99",
    });
    await assert.rejects(() =>
      editRoster(sql, "softball", {
        teamId: "soft",
        playerId: "base-player",
        revision: 2,
        field: "number",
        value: "5",
      }),
    );
    await assert.rejects(
      () =>
        editRoster(sql, "softball", {
          teamId: "soft",
          playerId: "soft-player",
          revision: 1,
          field: "number",
          value: "5",
        }),
      /changed/,
    );
    const [raw] = await sql<{ payload: unknown }>`select payload from club_state`;
    assert.match(JSON.stringify(raw.payload), /PRIVATE-MEDICAL/);
    assert.match(JSON.stringify(raw.payload), /PRIVATE-PAYMENT/);
    await saveAssignment(sql, "owner", { ...input, permissions: [] });
    await assert.rejects(() => roster(sql, "softball", "soft"));
    const active = await assign("softball", "softball", ["rosters.read"]);
    await saveAssignment(sql, "owner", { ...active, status: "suspended" });
    await assert.rejects(() => roster(sql, "softball", "soft"));
    await assert.rejects(() => saveAssignment(sql, "owner", { ...active, revision: 0 }), /changed/);
    await sql`update "user" set "disabledAt"=now() where id='baseball'`;
    await assert.rejects(() => coordinatorHome(sql, "baseball"));
    const auditRows = await sql`select * from coordinator_audit where result='denied'`;
    assert.ok(auditRows.length > 5);
    await assert.rejects(() => sql`delete from coordinator_audit`);
    await assert.rejects(() => sql`update coordinator_audit set action='erase'`);
  } finally {
    await db.close();
  }
});
test("team-only recruiting, strict editing, messages, reports, public title independence", async () => {
  const { db, sql, assign } = await fixture();
  try {
    await assign(
      "softball",
      "softball",
      [
        "recruiting.read",
        "recruiting.create",
        "recruiting.update",
        "recruiting.status",
        "recruiting.notes",
        "contacts.read",
        "communications.recruit.send",
        "communications.team.send",
        "reports.read",
      ],
      "teams",
      ["soft"],
    );
    const id = randomUUID();
    await createProspect(sql, "softball", {
      id,
      sport: "softball",
      teamId: "soft",
      player: "Synthetic Player",
      age: "14U",
      positions: "OF",
      parent: "Guardian",
      email: "guardian@example.invalid",
      phone: "",
    });
    await sql`insert into club_requests(id,kind,payload) values('other','tryout','{"sport":"baseball","player":"OTHER-SPORT"}'),('unassigned','tryout','{"sport":"softball","player":"UNASSIGNED"}'),('money','refund-review','{"sport":"softball","preferredTeamId":"soft","player":"FINANCIAL"}')`;
    const rows = await recruiting(sql, "softball", { sport: "softball", teamId: "soft" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    await assert.rejects(() => recruiting(sql, "softball", { sport: "softball", teamId: "" }));
    await assert.rejects(() =>
      createProspect(sql, "softball", {
        id: randomUUID(),
        sport: "softball",
        teamId: "base",
        player: "No",
        age: "14U",
        positions: "",
        parent: "P",
        email: "p@example.invalid",
        phone: "",
      }),
    );
    await editRequest(sql, "softball", { action: "status", id, revision: 0, status: "contacted" });
    await assert.rejects(() =>
      editRequest(sql, "softball", {
        action: "status",
        id: "other",
        revision: 0,
        status: "contacted",
      }),
    );
    const note = randomUUID();
    await editRequest(sql, "softball", {
      action: "note",
      id,
      actionId: note,
      note: "Follow up tomorrow",
    });
    await assert.rejects(() =>
      editRequest(sql, "softball", { action: "note", id, actionId: note, note: "Duplicate" }),
    );
    const mail = {
      id: randomUUID(),
      requestId: id,
      subject: "Tryout",
      body: "Please confirm your time.",
      confirmedEmail: "guardian@example.invalid",
    };
    await assert.rejects(() =>
      sendRecruitingEmail(sql, "softball", { ...mail, confirmedEmail: "stranger@example.invalid" }),
    );
    await sendRecruitingEmail(sql, "softball", mail);
    assert.equal((await sql<{allowed:boolean}>`select coordinator_notice_allowed('softball',${id},'guardian@example.invalid') as allowed`)[0].allowed,true);
    await sql`update coordinator_assignments set status='suspended' where user_id='softball'`;
    assert.equal((await sql<{allowed:boolean}>`select coordinator_notice_allowed('softball',${id},'guardian@example.invalid') as allowed`)[0].allowed,false);
    await sql`update coordinator_assignments set status='active' where user_id='softball'`;

    await assert.rejects(() => sendRecruitingEmail(sql, "softball", mail));
    await postTeamMessage(sql, "softball", {
      id: randomUUID(),
      teamId: "soft",
      confirmedTeamId: "soft",
      body: "Practice reminder.",
    });
    await assert.rejects(() =>
      postTeamMessage(sql, "softball", {
        id: randomUUID(),
        teamId: "base",
        confirmedTeamId: "base",
        body: "No",
      }),
    );
    assert.deepEqual(
      await operationalReports(sql, "softball", { sport: "softball", teamId: "soft" }),
      { teams: 1, players: 1, registrations: 1, followups: 0 },
    );
    await assign("zero", "softball");
    await saveLeadership(sql, "owner", {
      userId: "zero",
      revision: 0,
      enabled: true,
      titles: ["Softball Coordinator"],
      order: 5,
    });
    const publicRows = await publicPeopleFor(sql);
    assert.ok(publicRows.some((p) => p.name === "zero" && p.title === "Softball Coordinator"));
    await assert.rejects(() => roster(sql, "zero", "soft"));
    assert.equal((await coordinatorHome(sql, "zero")).assignments[0].permissions.length, 0);
    await sql`insert into registration_readers(user_id,email,granted_by) values('legacy','legacy@example.invalid','owner')`;
    await assert.rejects(() => assign("legacy", "softball"), /legacy/);
  } finally {
    await db.close();
  }
});
test("shared occupancy conflict rollback, practice synchronization, approvals and draft publication boundaries", async () => {
  const { db, sql, assign } = await fixture();
  try {
    await assign("softball", "softball", [
      "events.read",
      "practices.create",
      "practices.update",
      "cages.read",
      "cages.reserve",
      "cages.update",
      "cages.release",
      "events.cancel.request",
      "content.draft",
      "content.update",
      "content.submit",
    ]);
    const date = "2090-06-12",
      time = "16:00",
      id = randomUUID();
    const input = {
      id,
      teamId: "soft",
      revision: 0,
      title: "Team practice",
      date,
      time,
      duration: 60,
      location: "Facility",
      laneIds: ["1"] as ["1"],
    };
    await savePractice(sql, "softball", input);
    assert.equal((await schedules(sql, "softball", "soft")).length, 1);
    assert.equal(
      (await cageOccupancy(sql, "softball", { sport: "softball", teamId: "soft", date })).length,
      12,
    );
    await assert.rejects(
      () => savePractice(sql, "softball", { ...input, id: randomUUID() }),
      /already reserved/,
    );
    assert.equal((await sql`select id from team_activities`).length, 1);
    const [booking] = await sql<{
      booking_id: string;
    }>`select booking_id from coordinator_practice_bookings`;
    await sql`insert into booking_records(id,product_id,starts_at,ends_at,resources,status) select 'protected','paid-cage',starts_at+interval '1 hour',ends_at+interval '1 hour',resources,'confirmed' from booking_records where id=${booking.booking_id}`;
    await sql`insert into booking_occupancy select resource_id,slot_at+interval '1 hour','protected' from booking_occupancy where booking_id=${booking.booking_id}`;
    await assert.rejects(() =>
      savePractice(sql, "softball", { ...input, revision: 1, time: "17:00" }),
    );
    assert.equal(
      (await sql`select slot_at from booking_occupancy where booking_id=${booking.booking_id}`)
        .length,
      12,
    );
    assert.equal((await schedules(sql, "softball", "soft"))[0].time, "16:00");
    const cancel = randomUUID();
    await requestApproval(sql, "softball", {
      id: cancel,
      kind: "cancel-event",
      targetId: id,
      teamId: "soft",
      destinationTeamId: "",
      reason: "Weather",
    });
    await assert.rejects(() =>
      decideApproval(sql, "softball", {
        id: cancel,
        revision: 1,
        decision: "approved",
        reason: "Self",
        confirm: true,
      }),
    );
    assert.equal((await schedules(sql, "softball", "soft"))[0].status, "scheduled");
    await decideApproval(sql, "owner", {
      id: cancel,
      revision: 1,
      decision: "approved",
      reason: "Reviewed",
      confirm: true,
    });
    assert.equal((await schedules(sql, "softball", "soft"))[0].status, "cancelled");
    assert.equal(
      (await sql`select slot_at from booking_occupancy where booking_id=${booking.booking_id}`)
        .length,
      0,
    );
    assert.equal(
      (await sql`select slot_at from booking_occupancy where booking_id='protected'`).length,
      12,
    );
    const draft = randomUUID();
    await saveDraft(sql, "softball", {
      id: draft,
      revision: 0,
      sport: "softball",
      teamId: "",
      title: "Tryouts soon",
      body: "Owner review required",
      submit: true,
    });
    await decideApproval(sql, "owner", {
      id: draft,
      revision: 1,
      decision: "approved",
      reason: "Editorial review only",
      confirm: true,
    });
    const [d] = await sql<{
      status: string;
    }>`select status from coordinator_drafts where id=${draft}`;
    assert.equal(d.status, "approved");
    assert.equal(
      (await sql`select id from coordinator_approvals where status='pending'`).length,
      0,
    );
  } finally {
    await db.close();
  }
});
