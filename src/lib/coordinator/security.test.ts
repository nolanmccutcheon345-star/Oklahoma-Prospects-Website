import {
  requireGrant,
  secured,
  hasOrganizationOperations,
  requireOrganizationOperations,
} from "./access.server";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import type { ClubRecord } from "../teams/types";
import {
  permissionKeys,
  assignmentInput,
  type AssignmentInput,
  type Capability,
} from "./contracts";
import { saveAssignment, staffWorkspace, saveLeadership } from "./admin.server";
import {
  coordinatorHome,
  coordinatorEntry,
  teamCommunications,
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
import {
  runScheduledCoordinatorReviews,
  scheduledCoordinatorReviews,
} from "./scheduled-reviews.server";
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
    for (const permission of permissionKeys)
      await assert.rejects(() =>
        secured(sql, "zero", permission, (tx) =>
          requireGrant(tx, "zero", permission, "softball", "soft"),
        ),
      );
    await assign("baseball", "baseball", ["rosters.read"]);
    await assert.rejects(() => roster(sql, "baseball", "soft"));
    assert.equal((await roster(sql, "baseball", "base")).length, 1);
    await assign("baseball", "softball");
    await assert.rejects(() => roster(sql, "baseball", "soft"));
    await assign("baseball", "softball", ["rosters.read"]);
    assert.equal((await roster(sql, "baseball", "soft")).length, 1);

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
        "reports.recruiting",
        "reports.followups",
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
    assert.equal(rows.items.length, 1);
    assert.equal(rows.items[0].id, id);
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
    assert.equal(
      (
        await sql<{
          allowed: boolean;
        }>`select coordinator_notice_allowed('softball',${id},'guardian@example.invalid') as allowed`
      )[0].allowed,
      true,
    );
    await sql`update coordinator_assignments set status='suspended' where user_id='softball'`;
    assert.equal(
      (
        await sql<{
          allowed: boolean;
        }>`select coordinator_notice_allowed('softball',${id},'guardian@example.invalid') as allowed`
      )[0].allowed,
      false,
    );
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
      { teams: 1, players: 1, prospects: 1, followups: 0 },
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

test("account entry and complete historical pages retain current permissions and scope", async () => {
  const { db, sql, assign } = await fixture();
  try {
    assert.equal((await coordinatorEntry(sql, "parent")).available, false);
    const empty = await assign("zero", "softball");
    assert.equal((await coordinatorEntry(sql, "zero")).available, true);
    await saveAssignment(sql, "owner", { ...empty, status: "suspended" });
    assert.equal((await coordinatorEntry(sql, "zero")).available, false);
    const grant = await assign(
      "softball",
      "softball",
      ["tryouts.read", "communications.read"],
      "teams",
      ["soft"],
    );
    // More than the old hard limits, identical timestamps and source-private fields.
    await sql`insert into club_requests(id,kind,created_at,payload) select 'history-'||lpad(n::text,4,'0'),'tryout','2020-01-01T12:00:00.123456Z'::timestamptz,jsonb_build_object('sport','softball','preferredTeamId','soft','player','Historical player','email','PRIVATE-CONTACT','medical','PRIVATE-MEDICAL','paymentStatus','PRIVATE-FINANCE') from generate_series(1,205) n`;
    await sql`insert into club_requests(id,kind,payload) values('foreign','tryout','{"sport":"baseball","preferredTeamId":"base","player":"OTHER-SPORT"}'),('unknown','tryout','{"player":"UNKNOWN-SPORT"}')`;
    let before: { at: string; id: string } | undefined;
    const ids: string[] = [];
    do {
      const page = await recruiting(sql, "softball", { sport: "softball", teamId: "soft", before });
      assert.ok(page.items.length <= 100);
      assert.doesNotMatch(JSON.stringify(page), /PRIVATE|OTHER-SPORT|UNKNOWN-SPORT/);
      ids.push(...page.items.map((r) => r.id));
      before = page.nextCursor || undefined;
    } while (before);
    assert.equal(ids.length, 205);
    assert.equal(new Set(ids).size, 205);
    await assert.rejects(() =>
      recruiting(sql, "softball", {
        sport: "baseball",
        teamId: "base",
        before: { at: "2026-01-01T00:00:00Z", id: "foreign" },
      }),
    );
    await sql`insert into team_chat_messages(id,team_id,user_id,author,body,created_at) select gen_random_uuid(),'soft','owner','Coach','Historical team note','2020-01-01T00:00:00.123456Z'::timestamptz from generate_series(1,105)`;
    await sql`insert into team_chat_messages(id,team_id,user_id,author,body) values(gen_random_uuid(),'base','owner','Coach','PRIVATE-BASEBALL')`;
    const messages = await teamCommunications(sql, "softball", { teamId: "soft" });
    assert.equal(messages.items.length, 100);
    assert.ok(messages.nextCursor);
    const older = await teamCommunications(sql, "softball", {
      teamId: "soft",
      before: messages.nextCursor,
    });
    assert.equal(older.items.length, 5);
    assert.equal(older.nextCursor, null);
    assert.equal(new Set([...messages.items, ...older.items].map((r) => r.id)).size, 105);
    await assert.rejects(() =>
      teamCommunications(sql, "softball", { teamId: "base", before: messages.nextCursor! }),
    );
    await saveAssignment(sql, "owner", { ...grant, permissions: [] });
    await assert.rejects(() =>
      teamCommunications(sql, "softball", { teamId: "soft", before: messages.nextCursor! }),
    );
    await assert.rejects(() =>
      recruiting(sql, "softball", {
        sport: "softball",
        teamId: "soft",
        before: { at: "2026-01-01T00:00:00Z", id: "history-0200" },
      }),
    );
  } finally {
    await db.close();
  }
});

test("sport-wide intake and reports reject forged or orphaned team classifications", async () => {
  const { db, sql, assign } = await fixture();
  try {
    await assign("softball", "softball", [
      "tryouts.read",
      "contacts.read",
      "reports.tryouts",
      "reports.followups",
    ]);
    await sql`insert into club_requests(id,kind,payload) values
      ('valid','tryout','{"sport":"softball","preferredTeamId":"soft","player":"Allowed"}'),
      ('unassigned','tryout','{"sport":"softball","player":"Unassigned"}'),
      ('forged','tryout','{"sport":"softball","preferredTeamId":"base","player":"PRIVATE-BASEBALL"}'),
      ('orphan','tryout','{"sport":"softball","preferredTeamId":"missing","player":"PRIVATE-UNKNOWN"}')`;
    const page = await recruiting(sql, "softball", { sport: "softball", teamId: "" });
    assert.deepEqual(page.items.map((r) => r.id).sort(), ["unassigned", "valid"]);
    assert.doesNotMatch(JSON.stringify(page), /PRIVATE/);
    const report = await operationalReports(sql, "softball", { sport: "softball", teamId: "" });
    assert.equal(report.registrations, 2);
    assert.equal(report.followups, 2);
  } finally {
    await db.close();
  }
});

test("retired organization grants cannot bypass granular coordinator permissions", async () => {
  const { db, sql, assign } = await fixture();
  try {
    await assign("zero", "softball");
    await sql`insert into organization_operational_access(user_id,status,updated_by) values('zero','active','owner')`;
    assert.equal(await hasOrganizationOperations(sql, "zero"), false);
    await assert.rejects(() => requireOrganizationOperations(sql, "zero"));
    await assert.rejects(() => roster(sql, "zero", "soft"));
    await assert.rejects(() => recruiting(sql, "zero", { sport: "softball", teamId: "" }));
    await requireOrganizationOperations(sql, "owner");
    assert.equal((await coordinatorHome(sql, "zero")).organizationOperations, false);
    for (const permission of permissionKeys)
      await assert.rejects(() =>
        secured(sql, "zero", permission, (tx) =>
          requireGrant(tx, "zero", permission, "softball", "soft"),
        ),
      );
  } finally {
    await db.close();
  }
});

test("coordinator invitations require dedicated authority and accept with zero grants without changing base roles", async () => {
  const { inviteCoordinator, acceptCoordinatorInvitation, coordinatorInvitations } =
    await import("./invitations.server");
  const { db, sql } = await fixture();
  try {
    for (const actor of ["fake", "coach", "parent", "softball"])
      await assert.rejects(
        inviteCoordinator(sql, actor, { email: "zero@example.invalid", sport: "softball" }),
      );
    await assert.rejects(
      inviteCoordinator(sql, "owner", { email: "owner@example.invalid", sport: "softball" }),
    );
    await assert.rejects(
      inviteCoordinator(sql, "owner", {
        email: "zero@example.invalid",
        sport: "softball",
        permissions: ["recruiting.read"],
      } as never),
    );
    const before = await sql`select * from profiles where user_id='zero'`;
    const invite = await inviteCoordinator(sql, "owner", {
      email: " ZERO@example.invalid ",
      sport: "softball",
    });
    assert.equal((await coordinatorInvitations(sql, "owner")).length, 1);
    await assert.rejects(coordinatorInvitations(sql, "fake"));
    await assert.rejects(acceptCoordinatorInvitation(sql, "parent", invite.id));
    await sql`update "user" set "emailVerified"=false where id='zero'`;
    await assert.rejects(acceptCoordinatorInvitation(sql, "zero", invite.id));
    await sql`update "user" set "emailVerified"=true where id='zero'`;
    await acceptCoordinatorInvitation(sql, "zero", invite.id);
    assert.deepEqual(await sql`select * from profiles where user_id='zero'`, before);
    const [grant] =
      await sql`select permissions,team_ids,coverage,status,role from coordinator_assignments where user_id='zero'`;
    assert.deepEqual(grant, {
      permissions: [],
      team_ids: [],
      coverage: "teams",
      status: "active",
      role: "softball_coordinator",
    });
    for (const capability of permissionKeys)
      await assert.rejects(requireGrant(sql, "zero", capability, "softball", "soft"));
    assert.equal((await coordinatorHome(sql, "zero")).targets.length, 0);
    await assert.rejects(acceptCoordinatorInvitation(sql, "zero", invite.id));
    assert.equal((await coordinatorInvitations(sql, "owner")).length, 0);
    const [audit] =
      await sql`select count(*)::int as n from coordinator_audit where action='staff.invitation.accept' and result='allowed'`;
    assert.equal(audit.n, 1);
  } finally {
    await db.close();
  }
});

test("invitation expiry, replacement, revocation and revoked owner authority fail closed", async () => {
  const { inviteCoordinator, acceptCoordinatorInvitation, revokeCoordinatorInvitation } =
    await import("./invitations.server");
  const { db, sql } = await fixture();
  try {
    const first = await inviteCoordinator(sql, "owner", {
      email: "zero@example.invalid",
      sport: "softball",
    });
    const replacement = await inviteCoordinator(sql, "owner", {
      email: "zero@example.invalid",
      sport: "softball",
    });
    await assert.rejects(acceptCoordinatorInvitation(sql, "zero", first.id));
    await assert.rejects(revokeCoordinatorInvitation(sql, "fake", replacement.id));
    await revokeCoordinatorInvitation(sql, "owner", replacement.id);
    await assert.rejects(acceptCoordinatorInvitation(sql, "zero", replacement.id));
    const expired = await inviteCoordinator(sql, "owner", {
      email: "zero@example.invalid",
      sport: "softball",
    });
    await sql`update club_invites set expires_at=now()-interval '1 second' where id=${expired.id}`;
    await assert.rejects(acceptCoordinatorInvitation(sql, "zero", expired.id));
    const revokedOwner = await inviteCoordinator(sql, "owner", {
      email: "zero@example.invalid",
      sport: "softball",
    });
    await sql`delete from staff_authorities where email='owner@example.invalid' and capability='staff_roles.manage'`;
    await assert.rejects(acceptCoordinatorInvitation(sql, "zero", revokedOwner.id));
    assert.equal((await sql`select * from coordinator_assignments where user_id='zero'`).length, 0);
  } finally {
    await db.close();
  }
});

test("invitations cannot restore existing assignments or bypass adult and independent-role review", async () => {
  const { inviteCoordinator, acceptCoordinatorInvitation } = await import("./invitations.server");
  const { db, sql, assign } = await fixture();
  try {
    await assign("zero", "softball");
    await sql`update coordinator_assignments set status='removed' where user_id='zero'`;
    const before = await sql`select * from coordinator_assignments where user_id='zero'`;
    for (const target of ["zero", "coach", "instructor", "parent", "legacy"]) {
      if (target === "parent") await sql`update profiles set role='player' where user_id='parent'`;
      if (target === "legacy")
        await sql`insert into registration_readers(user_id,email,active,granted_by) values('legacy','legacy@example.invalid',true,'owner')`;
      const invite = await inviteCoordinator(sql, "owner", {
        email: target + "@example.invalid",
        sport: "softball",
      });
      await assert.rejects(acceptCoordinatorInvitation(sql, target, invite.id));
    }
    assert.deepEqual(await sql`select * from coordinator_assignments where user_id='zero'`, before);
    assert.equal((await sql`select * from coordinator_assignments`).length, 1);
  } finally {
    await db.close();
  }
});

test("owner access reviews attest exact revisions without granting access and remain immutable", async () => {
  const { db, sql, assign } = await fixture();
  try {
    const { coordinatorAccessReviews, reviewCoordinatorAccess } = await import("./reviews.server");
    const saved = await assign("zero", "softball");
    const input = {
      userId: "zero",
      sport: "softball" as const,
      revision: saved.revision,
      period: "monthly" as const,
      reason: "Reviewed assignment and activity",
      confirmed: true as const,
    };
    const before = await sql`select * from coordinator_assignments order by user_id,sport`;
    const roles = await sql`select * from profiles order by user_id`;
    for (const actor of ["zero", "softball", "fake", "coach", "parent"]) {
      await assert.rejects(coordinatorAccessReviews(sql, actor));
      await assert.rejects(reviewCoordinatorAccess(sql, actor, input));
    }
    await assert.rejects(
      reviewCoordinatorAccess(sql, "owner", { ...input, revision: 99 }),
      /changed/,
    );
    await assert.rejects(
      reviewCoordinatorAccess(sql, "owner", {
        ...input,
        permissions: ["recruiting.read"],
      } as never),
    );
    let workspace = await coordinatorAccessReviews(sql, "owner");
    assert.equal(workspace.assignments.length, 3);
    assert.ok(workspace.assignments.every((row) => row.due));
    await reviewCoordinatorAccess(sql, "owner", input);
    workspace = await coordinatorAccessReviews(sql, "owner");
    assert.equal(workspace.assignments.find((row) => row.period === "monthly")?.due, false);
    assert.ok(
      workspace.assignments.filter((row) => row.period !== "monthly").every((row) => row.due),
    );
    assert.deepEqual(workspace.history[0].details.snapshot.permissions, []);
    assert.equal(workspace.history[0].details.revision, saved.revision);
    assert.deepEqual(
      await sql`select * from coordinator_assignments order by user_id,sport`,
      before,
    );
    assert.deepEqual(await sql`select * from profiles order by user_id`, roles);
    await assert.rejects(requireGrant(sql, "zero", "recruiting.read", "softball"));
    await assert.rejects(
      sql`update coordinator_audit set details='{}'::jsonb where action='staff.access-review'`,
    );
    await assert.rejects(sql`delete from coordinator_audit where action='staff.access-review'`);
    await saveAssignment(sql, "owner", { ...saved, permissions: ["recruiting.read"] });
    workspace = await coordinatorAccessReviews(sql, "owner");
    assert.equal(workspace.assignments.find((row) => row.period === "monthly")?.due, true);
    await assert.rejects(reviewCoordinatorAccess(sql, "owner", input), /changed/);
    assert.deepEqual(workspace.history[0].details.snapshot.permissions, []);
    await sql`insert into coordinator_audit(actor_id,action,target_id,result,details,correlation_id,sport,created_at) values('owner','staff.access-review','zero','allowed',${JSON.stringify({ period: "quarterly", revision: saved.revision + 1, reason: "Historical review", snapshot: {} })}::jsonb,${randomUUID()},'softball',now()-interval '91 days')`;
    assert.equal(
      (await coordinatorAccessReviews(sql, "owner")).assignments.find(
        (row) => row.period === "quarterly",
      )?.due,
      true,
    );
    const { saveCoordinatorReviewPolicy } = await import("./reviews.server");
    const { activityWorkspace } = await import("./admin.server");
    const policy = {
      ...(await coordinatorAccessReviews(sql, "owner")).policy,
      quarterlyDays: 180,
      denialThreshold: 100,
    };
    const permissionsBeforePolicy =
      await sql`select * from coordinator_assignments order by user_id,sport`;
    await assert.rejects(saveCoordinatorReviewPolicy(sql, "zero", policy));
    await assert.rejects(saveCoordinatorReviewPolicy(sql, "fake", policy));
    await assert.rejects(
      saveCoordinatorReviewPolicy(sql, "owner", { ...policy, denialThreshold: 0 }),
    );
    await saveCoordinatorReviewPolicy(sql, "owner", policy);
    await assert.rejects(saveCoordinatorReviewPolicy(sql, "owner", policy), /changed/);
    const updated = await coordinatorAccessReviews(sql, "owner");
    assert.equal(updated.assignments.find((row) => row.period === "quarterly")?.due, false);
    assert.equal((await activityWorkspace(sql, "owner")).alerts.length, 0);
    await saveCoordinatorReviewPolicy(sql, "owner", {
      ...updated.policy,
      denialThreshold: 1,
      denialWindowHours: 48,
    });
    assert.ok(
      (await activityWorkspace(sql, "owner")).alerts.some((row) => row.actor_id === "zero"),
    );
    assert.equal((await activityWorkspace(sql, "owner")).denialWindowHours, 48);
    assert.deepEqual(
      await sql`select * from coordinator_assignments order by user_id,sport`,
      permissionsBeforePolicy,
    );
    await sql`delete from staff_authorities where email='owner@example.invalid' and capability='staff_roles.manage'`;
    await assert.rejects(
      reviewCoordinatorAccess(sql, "owner", { ...input, revision: saved.revision + 1 }),
    );
    await assert.rejects(coordinatorAccessReviews(sql, "owner"));
  } finally {
    await db.close();
  }
});

test("owner access reset clears both sports atomically while preserving financial isolation and rejecting stale reviews", async () => {
  const { resetCoordinatorAccess } = await import("./reset.server");
  const { financiallyRestricted } = await import("./access.server");
  const { db, sql, assign } = await fixture();
  try {
    await assign("zero", "baseball", ["rosters.read"]);
    await assign("zero", "softball", ["recruiting.read", "contacts.read"]);
    await sql`insert into organization_operational_access(user_id,status,updated_by) values('zero','active','owner')`;
    const roles = await sql`select * from profiles order by user_id`;
    const before =
      await sql`select * from coordinator_assignments where user_id='zero' order by sport`;
    const input = {
      userId: "zero",
      assignments: [
        { sport: "baseball" as const, revision: 2 },
        { sport: "softball" as const, revision: 2 },
      ],
      legacyRevision: 1,
      reason: "Owner reviewed withdrawal of both sport assignments",
      confirmed: true as const,
    };
    for (const actor of ["zero", "fake", "parent", "coach"])
      await assert.rejects(resetCoordinatorAccess(sql, actor, input));
    await assert.rejects(
      resetCoordinatorAccess(sql, "owner", {
        ...input,
        assignments: input.assignments.slice(0, 1),
      }),
      /changed/,
    );
    await assert.rejects(
      resetCoordinatorAccess(sql, "owner", { ...input, legacyRevision: 2 }),
      /changed/,
    );
    assert.deepEqual(
      await sql`select * from coordinator_assignments where user_id='zero' order by sport`,
      before,
    );
    const requestId = randomUUID();
    await sql`insert into club_requests(id,kind,payload) values(${requestId},'tryout','{"sport":"softball"}')`;
    for (const status of ["pending", "processing", "review", "sent"])
      await sql`insert into tryout_center_notices(id,request_id,email,subject,body,dedupe_key,coordinator_actor_id,status) values(${status},${requestId},'synthetic@example.invalid','Subject','Body',${status},'zero',${status})`;
    const approvalId = randomUUID();
    await sql`insert into coordinator_approvals(id,requester_id,sport,kind,target_id,proposal,reason) values(${approvalId},'zero','softball','content','draft','{}','Synthetic pending request')`;
    // A failed audit must roll back every permission and pending-work change.
    await sql`create function reject_reset_fixture() returns trigger language plpgsql as $$ begin if new.action='staff.access-reset' and new.result='allowed' then raise exception 'synthetic audit failure'; end if; return new; end $$`;
    await sql`create trigger reject_reset_fixture before insert on coordinator_audit for each row execute function reject_reset_fixture()`;
    await assert.rejects(resetCoordinatorAccess(sql, "owner", input), /synthetic audit failure/);
    assert.deepEqual(
      await sql`select * from coordinator_assignments where user_id='zero' order by sport`,
      before,
    );
    assert.equal(
      (await sql`select status from tryout_center_notices where id='pending'`)[0].status,
      "pending",
    );
    await sql`drop trigger reject_reset_fixture on coordinator_audit`;
    await resetCoordinatorAccess(sql, "owner", input);
    const after = await sql<{
      status: string;
      permissions: string[];
      team_ids: string[];
      revision: number;
    }>`select * from coordinator_assignments where user_id='zero' order by sport`;
    assert.ok(
      after.every(
        (r) =>
          r.status === "suspended" &&
          r.permissions.length === 0 &&
          r.team_ids.length === 0 &&
          r.revision === 3,
      ),
    );
    assert.equal(await financiallyRestricted(sql, "zero"), true);
    assert.equal(
      (await sql`select status from organization_operational_access where user_id='zero'`)[0]
        .status,
      "removed",
    );
    assert.equal(
      (await sql`select status from coordinator_approvals where id=${approvalId}`)[0].status,
      "rejected",
    );
    assert.equal(
      (await sql`select status from tryout_center_notices where id='sent'`)[0].status,
      "sent",
    );
    assert.equal(
      (await sql`select count(*)::int as n from tryout_center_notices where status='superseded'`)[0]
        .n,
      3,
    );
    assert.deepEqual(await sql`select * from profiles order by user_id`, roles);
    await assert.rejects(requireGrant(sql, "zero", "rosters.read", "baseball", "base"));
    await assert.rejects(resetCoordinatorAccess(sql, "owner", input), /changed/);
    await sql`insert into owner_grants(email,user_id) values('parent@example.invalid','parent')`;
    await assert.rejects(
      resetCoordinatorAccess(sql, "owner", {
        ...input,
        userId: "parent",
        assignments: [],
        legacyRevision: 0,
      }),
      /Owner access/,
    );
  } finally {
    await db.close();
  }
});

test("former blanket accounts require audited withdrawal before explicit scoped reactivation, retaining financial denial and hiding old drafts", async () => {
  const { resetCoordinatorAccess } = await import("./reset.server");
  const { requireUnrestrictedLegacyAccess, financiallyRestricted } =
    await import("./access.server");
  const { drafts } = await import("./governance.server");
  const { db, sql, assign } = await fixture();
  try {
    await assign("zero", "softball", [
      "recruiting.read",
      "tryouts.read",
      "contacts.read",
      "communications.recruit.send",
      "content.draft",
      "content.update",
      "content.submit",
    ]);
    await sql`insert into organization_operational_access(user_id,status,updated_by) values('zero','active','owner')`;
    const oldDraft = randomUUID();
    await sql`insert into coordinator_drafts(id,user_id,sport,team_id,title,body) values(${oldDraft},'zero','softball','soft','Old narrative','PRIVATE-FINANCIAL-HISTORY')`;
    await sql`insert into club_requests(id,kind,payload) values('scoped-history','tryout','{"sport":"softball","preferredTeamId":"soft","player":"Historical prospect","email":"synthetic@example.invalid"}')`;
    assert.equal((await coordinatorEntry(sql, "zero")).available, false);
    assert.deepEqual((await coordinatorHome(sql, "zero")).targets, []);
    await assert.rejects(recruiting(sql, "zero", { sport: "softball", teamId: "soft" }));
    const input: AssignmentInput = {
      userId: "zero",
      sport: "softball",
      revision: 2,
      status: "active",
      coverage: "teams",
      teamIds: ["soft"],
      permissions: [
        "recruiting.read",
        "tryouts.read",
        "contacts.read",
        "communications.recruit.send",
        "content.draft",
        "content.update",
        "content.submit",
      ],
      confirm: true,
      independentRolesReviewed: true,
    };
    await assert.rejects(saveAssignment(sql, "owner", input), /Withdraw/);
    assert.equal(
      (
        await sql`select coordinator_notice_allowed('zero','scoped-history','synthetic@example.invalid') as allowed`
      )[0].allowed,
      false,
    );
    await resetCoordinatorAccess(sql, "owner", {
      userId: "zero",
      assignments: [{ sport: "softball", revision: 2 }],
      legacyRevision: 1,
      reason: "Owner reviewed reset before explicit scoped delegation",
      confirmed: true,
    });
    assert.equal((await coordinatorEntry(sql, "zero")).available, false);
    await assert.rejects(requireGrant(sql, "zero", "recruiting.read", "softball", "soft"));
    await saveAssignment(sql, "owner", { ...input, revision: 3 });
    assert.equal((await coordinatorEntry(sql, "zero")).available, true);
    assert.equal((await coordinatorHome(sql, "zero")).scopedReady, true);
    assert.equal(
      (await recruiting(sql, "zero", { sport: "softball", teamId: "soft" })).items[0].id,
      "scoped-history",
    );
    await assert.rejects(recruiting(sql, "zero", { sport: "baseball", teamId: "base" }));
    assert.equal(await financiallyRestricted(sql, "zero"), true);
    await assert.rejects(requireUnrestrictedLegacyAccess(sql, "zero"));
    await assert.rejects(frontOfficeFor(sql, "zero"));
    await assert.rejects(requireOrganizationOperations(sql, "zero"));
    assert.equal(
      (
        await sql`select coordinator_notice_allowed('zero','scoped-history','synthetic@example.invalid') as allowed`
      )[0].allowed,
      true,
    );
    assert.deepEqual(await drafts(sql, "zero", { sport: "softball", teamId: "soft" }), []);
    await assert.rejects(
      saveDraft(sql, "zero", {
        id: oldDraft,
        revision: 1,
        sport: "softball",
        teamId: "soft",
        title: "Replacement",
        body: "No old narrative",
        submit: false,
      }),
    );
    const newDraft = randomUUID();
    await saveDraft(sql, "zero", {
      id: newDraft,
      revision: 0,
      sport: "softball",
      teamId: "soft",
      title: "Scoped announcement",
      body: "Synthetic team practice update",
      submit: true,
    });
    await decideApproval(sql, "owner", {
      id: newDraft,
      revision: 1,
      decision: "approved",
      reason: "Owner reviewed scoped announcement and publication remains separate",
      confirm: true,
    });
    const visible = await drafts(sql, "zero", { sport: "softball", teamId: "soft" });
    assert.equal(visible.length, 1);
    assert.doesNotMatch(JSON.stringify(visible), /PRIVATE-FINANCIAL/);
    // Any later legacy grant change invalidates the reset proof; there is no fallback.
    await sql`update organization_operational_access set status='active',revision=revision+1 where user_id='zero'`;
    await assert.rejects(requireGrant(sql, "zero", "recruiting.read", "softball", "soft"));
    assert.equal((await coordinatorEntry(sql, "zero")).available, false);
    assert.equal(
      (
        await sql`select coordinator_notice_allowed('zero','scoped-history','synthetic@example.invalid') as allowed`
      )[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});

test("follow-up assignment, tryout attendance and delivery history use independent grants and current record scope", async () => {
  const { db, sql, assign } = await fixture();
  const { followupWorkspace, saveFollowup, saveTryoutAttendance, recruitingDelivery } =
    await import("./recruiting-workflow.server");
  try {
    await sql`insert into club_requests(id,kind,payload) values('workflow-soft','tryout','{"sport":"softball","preferredTeamId":"soft","player":"Synthetic recruit","email":"guardian@example.invalid"}'),('workflow-base','tryout','{"sport":"baseball","preferredTeamId":"base","player":"Other sport"}'),('workflow-inquiry','team-inquiry','{"sport":"softball","preferredTeamId":"soft"}'),('workflow-forged','tryout','{"sport":"softball","preferredTeamId":"base"}')`;
    const input = {
      requestId: "workflow-soft",
      revision: 0,
      assigneeId: "softball",
      dueDate: "2027-02-01",
    };
    for (const actor of ["zero", "parent", "coach", "instructor"]) {
      await assert.rejects(followupWorkspace(sql, actor, input.requestId));
      await assert.rejects(saveFollowup(sql, actor, input));
      await assert.rejects(
        saveTryoutAttendance(sql, actor, {
          requestId: input.requestId,
          revision: 0,
          status: "attended",
        }),
      );
      await assert.rejects(recruitingDelivery(sql, actor, input.requestId));
    }
    await assign("softball", "softball", ["tryouts.read"], "teams", ["soft"]);
    await assign("baseball", "baseball", ["recruiting.read"]);
    await assign("zero", "softball", ["tryouts.read", "recruiting.followups"], "teams", ["soft"]);
    const workspace = await followupWorkspace(sql, "zero", input.requestId);
    assert.deepEqual(workspace.assignees.map((a) => a.id).sort(), ["owner", "softball", "zero"]);
    assert.doesNotMatch(JSON.stringify(workspace), /@|PRIVATE-MEDICAL|PRIVATE-PAYMENT/);
    await assert.rejects(saveFollowup(sql, "zero", { ...input, assigneeId: "baseball" }));
    await assert.rejects(saveFollowup(sql, "zero", { ...input, requestId: "workflow-base" }));
    await assert.rejects(saveFollowup(sql, "zero", { ...input, requestId: "workflow-forged" }));
    await saveFollowup(sql, "zero", input);
    await assert.rejects(saveFollowup(sql, "zero", input), /changed/);
    assert.equal((await followupWorkspace(sql, "zero", input.requestId)).dueDate, "2027-02-01");
    await assert.rejects(
      saveTryoutAttendance(sql, "zero", {
        requestId: input.requestId,
        revision: 1,
        status: "attended",
      }),
    );
    await assign("zero", "softball", ["tryouts.read", "tryouts.status"]);
    await assert.rejects(
      editRequest(sql, "zero", {
        action: "status",
        id: input.requestId,
        revision: 1,
        status: "attended",
      }),
    );
    await assign("zero", "softball", [
      "recruiting.read",
      "tryouts.read",
      "tryouts.attendance",
      "communications.delivery.read",
    ]);
    await saveTryoutAttendance(sql, "zero", {
      requestId: input.requestId,
      revision: 1,
      status: "attended",
    });
    await assert.rejects(
      saveTryoutAttendance(sql, "zero", {
        requestId: input.requestId,
        revision: 1,
        status: "no-show",
      }),
      /changed/,
    );
    await assert.rejects(
      saveTryoutAttendance(sql, "zero", {
        requestId: "workflow-inquiry",
        revision: 0,
        status: "attended",
      }),
    );
    await assert.rejects(
      saveTryoutAttendance(sql, "zero", {
        requestId: "workflow-base",
        revision: 0,
        status: "attended",
      }),
    );
    const [work] =
      await sql`select follow_up,assignee_id,to_char(follow_up_date,'YYYY-MM-DD') as due from office_request_work where request_id='workflow-soft'`;
    assert.deepEqual(work, { follow_up: "attended", assignee_id: "softball", due: "2027-02-01" });
    await sql`insert into tryout_center_notices(id,request_id,email,subject,body,dedupe_key,coordinator_actor_id,status) values('own','workflow-soft','guardian@example.invalid','Private subject','Private correspondence','own','zero','sent'),('other','workflow-soft','other@example.invalid','Other subject','Other correspondence','other','softball','sent')`;
    const delivered = await recruitingDelivery(sql, "zero", input.requestId);
    assert.deepEqual(
      delivered.map((d) => d.id),
      ["own"],
    );
    assert.doesNotMatch(JSON.stringify(delivered), /@|correspondence|subject/);
    await assert.rejects(recruitingDelivery(sql, "zero", "workflow-base"));
    assert.equal(
      (await sql`select coordinator_recipient_allowed('softball','workflow-soft') as allowed`)[0]
        .allowed,
      true,
    );
    assert.equal(
      (await sql`select coordinator_recipient_allowed('softball','workflow-forged') as allowed`)[0]
        .allowed,
      false,
    );
    const { deliverCenterNotifications } = await import("../tryout-center-delivery.server");
    await sql`insert into tryout_center_notices(id,request_id,recipient_id,email,subject,body,dedupe_key) values('internal-task','workflow-soft','softball','softball@example.invalid','Follow-up due','Synthetic task','internal-task')`;
    let attempts = 0;
    const transport = (async () => {
      attempts++;
      throw Error("Synthetic retry");
    }) as typeof fetch;
    const env = {
      CONTEXT: "deploy-preview",
      NODE_ENV: "production",
      TRYOUT_NOTIFICATIONS_ENABLED: "true",
      RESEND_API_KEY: "synthetic-key",
      RESEND_FROM_EMAIL: "staff@example.invalid",
      TRYOUT_EMAIL_TEST_RECIPIENTS: "softball@example.invalid",
    };
    assert.equal((await deliverCenterNotifications(sql, env, transport)).failed, 1);
    assert.equal(attempts, 1);
    await sql`update tryout_center_notices set next_attempt_at=now() where id='internal-task'`;
    await saveAssignment(sql, "owner", await assign("softball", "softball", []));
    await deliverCenterNotifications(sql, env, transport);
    assert.equal(attempts, 1, "revocation blocks transport even after a queued retry");
    assert.equal(
      (await sql`select status from tryout_center_notices where id='internal-task'`)[0].status,
      "skipped",
    );
    assert.equal(
      (await sql`select coordinator_recipient_allowed('softball','workflow-soft') as allowed`)[0]
        .allowed,
      false,
    );
    await assign("zero", "softball", ["recruiting.read", "recruiting.followups"]);
    await assert.rejects(saveFollowup(sql, "zero", { ...input, revision: 2 }));
    const current = await followupWorkspace(sql, "zero", input.requestId);
    assert.equal(current.assigneeId, "");
    assert.ok(!current.assignees.some((a) => a.id === "softball"));
    await assert.rejects(recruitingDelivery(sql, "zero", input.requestId));
    assert.equal(
      (
        await sql`select count(*)::int as n from coordinator_audit where action in ('recruiting.followups','tryouts.attendance') and result='allowed'`
      )[0].n,
      2,
    );
  } finally {
    await db.close();
  }
});

test("owner-approved transfers execute atomically with current scope and can be recovered once without copying projections", async () => {
  const { db, sql, assign } = await fixture();
  const { saveOrganizationTeam, saveOrganizationPlayer } = await import("./organization.server");
  const { transferRecovery, recoverTransfer } = await import("./governance.server");
  try {
    await sql`update club_state set payload=jsonb_set(jsonb_set(payload,'{settings,membershipMonthly}','0'::jsonb),'{settings,orgFeeFloor}','0'::jsonb) where id='oklahoma-prospects'`;
    const from = randomUUID(),
      to = randomUUID(),
      playerId = randomUUID();
    await saveOrganizationTeam(sql, "owner", {
      revision: 1,
      teamId: from,
      changes: { name: "Synthetic team A", sport: "softball", age: "12U" },
    });
    await saveOrganizationTeam(sql, "owner", {
      revision: 2,
      teamId: to,
      changes: { name: "Synthetic team B", sport: "softball", age: "12U" },
    });
    await saveOrganizationPlayer(sql, "owner", {
      revision: 3,
      teamId: from,
      playerId,
      changes: { name: "Synthetic athlete" },
    });
    await assign("softball", "softball", ["rosters.transfer.request"], "teams", [from, to]);
    const id = randomUUID();
    await requestApproval(sql, "softball", {
      id,
      kind: "transfer",
      targetId: playerId,
      teamId: from,
      destinationTeamId: to,
      reason: "Owner review of routine team fit",
    });
    const original = (
      await sql<{
        payload: ClubRecord;
      }>`select payload from club_state where id='oklahoma-prospects'`
    )[0].payload.teams.find((t) => t.id === from)!.roster[0];
    await assert.rejects(
      decideApproval(sql, "softball", {
        id,
        revision: 1,
        decision: "approved",
        reason: "Self approval",
        confirm: true,
      }),
    );
    await decideApproval(sql, "owner", {
      id,
      revision: 1,
      decision: "approved",
      reason: "Reviewed eligibility and agreements",
      confirm: true,
    });
    const moved = (
      await sql<{
        payload: ClubRecord;
      }>`select payload from club_state where id='oklahoma-prospects'`
    )[0].payload;
    assert.equal(moved.teams.find((t) => t.id === from)!.roster.length, 0);
    assert.deepEqual(moved.teams.find((t) => t.id === to)!.roster[0], { ...original, teamId: to });
    await assert.rejects(
      decideApproval(sql, "owner", {
        id,
        revision: 1,
        decision: "approved",
        reason: "Replay approval",
        confirm: true,
      }),
    );
    await assert.rejects(transferRecovery(sql, "softball", id));
    const preview = await transferRecovery(sql, "owner", id);
    assert.doesNotMatch(JSON.stringify(preview), /PRIVATE-MEDICAL|PRIVATE-PAYMENT/);
    const recovery = {
      approvalId: id,
      approvalRevision: preview.approvalRevision,
      rosterRevision: preview.rosterRevision,
      reason: "Restore original placement after review",
      confirm: true as const,
    };
    await assert.rejects(recoverTransfer(sql, "owner", { ...recovery, rosterRevision: 1 }));
    await recoverTransfer(sql, "owner", recovery);
    const restored = (
      await sql<{
        payload: ClubRecord;
      }>`select payload from club_state where id='oklahoma-prospects'`
    )[0].payload;
    assert.deepEqual(restored.teams.find((t) => t.id === from)!.roster[0], original);
    assert.equal(restored.teams.find((t) => t.id === to)!.roster.length, 0);
    await assert.rejects(recoverTransfer(sql, "owner", recovery));
    // Existing financial commitments remain protected, even with owner approval.
    await assign("softball", "softball", ["rosters.transfer.request"]);
    const blocked = randomUUID();
    await requestApproval(sql, "softball", {
      id: blocked,
      kind: "transfer",
      targetId: "soft-player",
      teamId: "soft",
      destinationTeamId: to,
      reason: "Review committed roster athlete",
    });
    const before = (
      await sql<{
        payload: ClubRecord;
      }>`select payload from club_state where id='oklahoma-prospects'`
    )[0].payload;
    await assert.rejects(
      decideApproval(sql, "owner", {
        id: blocked,
        revision: 1,
        decision: "approved",
        reason: "Review financial commitment guard",
        confirm: true,
      }),
    );
    assert.deepEqual(
      (
        await sql<{
          payload: ClubRecord;
        }>`select payload from club_state where id='oklahoma-prospects'`
      )[0].payload,
      before,
    );
    assert.equal(
      (await sql`select status from coordinator_approvals where id=${blocked}`)[0].status,
      "pending",
    );
    assert.equal(
      (
        await sql`select count(*)::int as n from coordinator_audit where action='approval.transfer.recovered' and result='allowed'`
      )[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("scheduled reviews are idempotent, owner-scoped, append-only, minimized and transactional with their outbox", async () => {
  const { db, sql, assign } = await fixture();
  try {
    await assign("softball", "softball", ["rosters.read"], "teams", ["soft"]);
    const grantsBefore = await sql`select * from coordinator_assignments order by user_id,sport`;
    const now = new Date("2030-04-04T14:00:00Z");
    assert.equal(
      (await runScheduledCoordinatorReviews(sql, new Date("2030-04-04T10:00:00Z"))).created,
      0,
    );
    assert.equal((await runScheduledCoordinatorReviews(sql, now)).created, 4);
    assert.equal((await runScheduledCoordinatorReviews(sql, now)).created, 0);
    const rows = await scheduledCoordinatorReviews(sql, "owner");
    assert.equal(rows.length, 4);
    assert.equal(
      rows.find((r) => r.cadence === "weekly")!.period_end.toISOString(),
      "2030-04-01T05:00:00.000Z",
    );
    assert.equal(
      rows.find((r) => r.cadence === "monthly")!.period_start.toISOString(),
      "2030-03-01T06:00:00.000Z",
    );
    assert.equal(
      rows.find((r) => r.cadence === "quarterly")!.period_start.toISOString(),
      "2030-01-01T06:00:00.000Z",
    );
    assert.ok(rows.every((r) => r.findings.length === 0));
    assert.doesNotMatch(JSON.stringify(rows), /@|PRIVATE-MEDICAL|PRIVATE-PAYMENT|Guardian/);
    assert.deepEqual(
      await sql`select * from coordinator_assignments order by user_id,sport`,
      grantsBefore,
    );
    for (const actor of ["softball", "baseball", "zero", "parent", "coach", "fake"])
      await assert.rejects(scheduledCoordinatorReviews(sql, actor));
    assert.equal(
      (await sql`select * from site_alert_deliveries where audience='coordinator-owners'`).length,
      4,
    );
    assert.deepEqual(
      (
        await sql`select distinct recipient from site_alert_deliveries where audience='coordinator-owners'`
      ).map((r) => r.recipient),
      ["owner@example.invalid"],
    );
    await assert.rejects(sql`update coordinator_review_runs set findings='[]'::jsonb`);
    await assert.rejects(sql`delete from coordinator_review_runs`);
    await assert.rejects(sql`truncate coordinator_review_runs`);
    // An invalid scope and disabled account are findings, never auto-repaired grants.
    await sql`update coordinator_assignments set team_ids=array['base'] where user_id='softball'`;
    await sql`update "user" set "disabledAt"=now() where id='softball'`;
    await sql`alter table coordinator_audit disable trigger immutable_audit`;
    assert.equal(
      (await runScheduledCoordinatorReviews(sql, new Date("2030-04-05T14:00:00Z"))).created,
      1,
    );
    const findingRows = await scheduledCoordinatorReviews(sql, "owner");
    assert.deepEqual(
      findingRows
        .find((r) => r.id === "daily:2030-04-05")!
        .findings.map((f) => f.code)
        .sort(),
      ["audit-protection-missing", "inactive-account-retained-grants", "invalid-team-scope"],
    );
    await sql`alter table coordinator_audit enable trigger immutable_audit`;
    // A failed outbox insert must not consume the daily review receipt.
    await sql.query(
      "create function synthetic_review_failure() returns trigger language plpgsql as $$ begin raise exception 'Synthetic outbox failure'; end $$",
    );
    await sql.query(
      "create trigger synthetic_review_failure before insert on site_alert_deliveries for each row execute function synthetic_review_failure()",
    );
    await assert.rejects(
      runScheduledCoordinatorReviews(sql, new Date("2030-04-06T14:00:00Z")),
      /Synthetic outbox failure/,
    );
    assert.equal(
      (await sql`select id from coordinator_review_runs where id='daily:2030-04-06'`).length,
      0,
    );
    await sql.query("drop trigger synthetic_review_failure on site_alert_deliveries");
    assert.equal(
      (await runScheduledCoordinatorReviews(sql, new Date("2030-04-06T14:00:00Z"))).created,
      1,
    );
    await sql`delete from staff_authorities where email='owner@example.invalid' and capability='staff_activity.read'`;
    await sql`delete from site_alert_events`;
    let sends = 0;
    const { deliverSiteAlerts } = await import("../site-alerts.server");
    await deliverSiteAlerts(
      sql,
      {
        key: "synthetic",
        from: "staff@example.invalid",
        origin: "https://example.invalid",
        production: true,
        now: new Date("2030-04-06T10:00:00Z"),
      },
      (async () => {
        sends++;
        return Response.json({ id: "synthetic" });
      }) as typeof fetch,
    );
    assert.equal(sends, 0, "revoked review authority blocks all queued review email");
    assert.equal(
      (
        await sql`select id from site_alert_deliveries where audience='coordinator-owners' and status<>'revoked'`
      ).length,
      0,
    );
    await assert.rejects(scheduledCoordinatorReviews(sql, "owner"));
  } finally {
    await db.close();
  }
});

test("prospect, tryout, report and team-operation grants remain independent with no silent expansion", async () => {
  const { db, sql, assign } = await fixture();
  const { teamOperations, saveTeamOperations } = await import("./team-operations.server");
  try {
    await sql`insert into club_requests(id,kind,payload) values('granular-prospect','team-inquiry','{"sport":"softball","preferredTeamId":"soft","player":"Prospect","email":"PRIVATE-CONTACT"}'),('granular-tryout','tryout','{"sport":"softball","preferredTeamId":"soft","player":"Tryout"}'),('granular-other','tryout','{"sport":"baseball","preferredTeamId":"base","player":"OTHER-SPORT"}')`;
    await assign(
      "zero",
      "softball",
      ["recruiting.read", "recruiting.status", "reports.read"],
      "teams",
      ["soft"],
    );
    assert.deepEqual(
      (await recruiting(sql, "zero", { sport: "softball", teamId: "soft" })).items.map((r) => r.id),
      ["granular-prospect"],
    );
    await assert.rejects(
      editRequest(sql, "zero", {
        action: "status",
        id: "granular-tryout",
        revision: 0,
        status: "contacted",
      }),
    );
    assert.deepEqual(await operationalReports(sql, "zero", { sport: "softball", teamId: "soft" }), {
      teams: 1,
      players: 1,
    });
    await assign(
      "zero",
      "softball",
      ["tryouts.read", "tryouts.status", "reports.tryouts"],
      "teams",
      ["soft"],
    );
    assert.deepEqual(
      (await recruiting(sql, "zero", { sport: "softball", teamId: "soft" })).items.map((r) => r.id),
      ["granular-tryout"],
    );
    await assert.rejects(
      editRequest(sql, "zero", {
        action: "status",
        id: "granular-prospect",
        revision: 0,
        status: "contacted",
      }),
    );
    await editRequest(sql, "zero", {
      action: "status",
      id: "granular-tryout",
      revision: 0,
      status: "contacted",
    });
    assert.deepEqual(await operationalReports(sql, "zero", { sport: "softball", teamId: "soft" }), {
      registrations: 1,
    });
    await assert.rejects(operationalReports(sql, "zero", { sport: "baseball", teamId: "base" }));
    await assert.rejects(operationalReports(sql, "zero", { sport: "softball", teamId: "" }));
    await assert.rejects(teamOperations(sql, "zero", "soft"));
    await assign("zero", "softball", ["teams.openings"], "teams", ["soft"]);
    assert.deepEqual(await teamOperations(sql, "zero", "soft"), { revision: 0, openings: 0 });
    await saveTeamOperations(sql, "zero", {
      teamId: "soft",
      revision: 0,
      field: "openings",
      value: 3,
    });
    await assert.rejects(
      saveTeamOperations(sql, "zero", {
        teamId: "soft",
        revision: 1,
        field: "needs",
        value: "Pitchers",
      }),
    );
    await assert.rejects(
      saveTeamOperations(sql, "zero", { teamId: "soft", revision: 0, field: "openings", value: 4 }),
      /changed/,
    );
    await assert.rejects(teamOperations(sql, "zero", "base"));
    await assign("zero", "softball", ["teams.needs", "reports.openings"], "teams", ["soft"]);
    assert.deepEqual(await teamOperations(sql, "zero", "soft"), { revision: 1, needs: "" });
    await saveTeamOperations(sql, "zero", {
      teamId: "soft",
      revision: 1,
      field: "needs",
      value: "Pitchers and catchers",
    });
    assert.deepEqual(await operationalReports(sql, "zero", { sport: "softball", teamId: "soft" }), {
      openings: 3,
    });
    assert.equal(
      (await sql`select openings from coordinator_team_operations where team_id='soft'`)[0]
        .openings,
      3,
    );
    assert.doesNotMatch(
      JSON.stringify(await teamOperations(sql, "zero", "soft")),
      /PRIVATE|payments|guardian|openings/,
    );
    const previous = await sql`select payload from club_state`;
    await assign("zero", "softball", ["rosters.number"], "teams", ["soft"]);
    const [p] = await sql<{
      number: string;
    }>`select payload->'teams'->1->'roster'->0->>'number' as number from club_state`;
    await sql`update club_state set payload=jsonb_set(payload,'{teams,1,roster}',(payload->'teams'->1->'roster')||jsonb_build_array(jsonb_build_object('id','second-player','number','88'))) where id='oklahoma-prospects'`;
    await assert.rejects(
      editRoster(sql, "zero", {
        teamId: "soft",
        playerId: "soft-player",
        revision: 1,
        field: "number",
        value: "88",
      }),
      /already assigned/,
    );
    assert.equal(
      (await sql`select payload->'teams'->1->'roster'->0->>'number' as number from club_state`)[0]
        .number,
      p.number,
    );
    assert.equal(
      (await sql<{ team: { id: string } }>`select payload->'teams'->0 as team from club_state`)[0]
        .team.id,
      (previous[0].payload as { teams: { id: string }[] }).teams[0].id,
    );
  } finally {
    await db.close();
  }
});

test("scoped camps and clinics reuse existing events, enrollment and shared cage occupancy atomically", async () => {
  const { db, sql, assign } = await fixture();
  const ops = await import("./program-events.server");
  const ownerEvents = await import("./organization-events.server");
  try {
    await sql`insert into pd_working_file(id,payload) values('club','{"coaches":[{"id":"event-coach","name":"Synthetic Instructor","email":"coach@example.invalid","active":true}]}')`;
    await sql`insert into club_athletes(id,name,household_email,user_id,profile) values('linked-athlete','Linked athlete','guardian@example.invalid','parent','{"medical":"PRIVATE-MEDICAL","fees":9999}'),('other-athlete','Other athlete','private@example.invalid','parent','{}')`;
    await sql`insert into recruiting_roster_links(athlete_id,team_id,roster_id,linked_by) values('linked-athlete','soft','soft-player','owner')`;
    const create = {
      requestId: randomUUID(),
      teamId: "soft",
      name: "Synthetic camp",
      description: "Scoped skill development camp",
      type: "camp" as const,
      location: "Facility",
      capacity: 10,
      coachIds: ["event-coach"],
      reason: "Create authorized team program",
    };
    await assign("zero", "softball");
    await assert.rejects(ops.createProgramEvent(sql, "zero", create));
    await assign("zero", "softball", ["camps.create"], "teams", ["soft"]);
    await assert.rejects(ops.createProgramEvent(sql, "zero", { ...create, teamId: "base" }));
    await assert.rejects(ops.createProgramEvent(sql, "zero", { ...create, type: "clinic" }));
    await ops.createProgramEvent(sql, "zero", create);
    await ops.createProgramEvent(sql, "zero", create);
    assert.equal(
      (
        await sql`select count(*)::int as n from operational_event_records where id=${create.requestId}`
      )[0].n,
      1,
    );
    assert.equal((await ops.programEvents(sql, "zero", { teamId: "soft" })).items.length, 0);
    assert.equal(
      (await ownerEvents.organizationEvents(sql, "owner")).events.some(
        (e) => e.id === create.requestId,
      ),
      true,
    );
    assert.equal((await ownerEvents.publicOperationalEvents(sql)).length, 0);
    const session = {
      eventId: create.requestId,
      revision: 1,
      date: "2099-01-12",
      start: "16:00",
      end: "17:00",
      location: "Facility",
      laneIds: ["1"] as "1"[],
      reason: "Reserve authorized camp session",
    };
    await assert.rejects(ops.addProgramSession(sql, "zero", session));
    await assign(
      "zero",
      "softball",
      [
        "events.read",
        "camps.update",
        "cages.reserve",
        "cages.update",
        "cages.release",
        "events.assign",
        "events.attendance",
      ],
      "teams",
      ["soft"],
    );
    const [paidOrder] =
      await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status) values('protected-event-order','protected-event-order','private@example.invalid','fixture-cage','cage','{}',9999,'paid') returning id`;
    await sql`insert into booking_records(id,order_id,product_id,starts_at,ends_at,resources,status) values('protected-event-booking',${paidOrder.id},'fixture-cage','2099-01-12T22:00:00Z','2099-01-12T23:00:00Z','["lane:1"]','confirmed')`;
    await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values('lane:1','2099-01-12T22:00:00Z','protected-event-booking')`;
    const financialBefore =
      await sql`select to_jsonb(o) as state from commerce_orders o order by id`;
    await assert.rejects(ops.addProgramSession(sql, "zero", session), /reserved|conflict/i);
    assert.equal(
      (
        await sql`select count(*)::int as n from operational_event_sessions where event_id=${create.requestId}`
      )[0].n,
      0,
    );
    assert.equal(
      (await sql`select revision from operational_event_records where id=${create.requestId}`)[0]
        .revision,
      1,
    );
    const added = await ops.addProgramSession(sql, "zero", { ...session, laneIds: ["2"] });
    let workspace = await ops.programEvents(sql, "zero", { teamId: "soft" });
    assert.equal(workspace.items.length, 1);
    assert.deepEqual(
      workspace.athletes.map((a) => a.id),
      ["linked-athlete"],
    );
    assert.doesNotMatch(JSON.stringify(workspace), /PRIVATE|9999|private@example|guardian@example/);
    const current = workspace.items[0].sessions[0];
    assert.deepEqual(current.laneIds, ["2"]);
    const move = {
      eventId: create.requestId,
      sessionKey: added.sessionKey,
      revision: 1,
      action: "reschedule" as const,
      date: session.date,
      start: "16:00",
      end: "17:00",
      location: "Facility",
      laneIds: ["1"] as "1"[],
      reason: "Review conflicting cage change",
    };
    await assert.rejects(ops.moveProgramSession(sql, "zero", move), /reserved|conflict/i);
    workspace = await ops.programEvents(sql, "zero", { teamId: "soft" });
    assert.equal(workspace.items[0].sessions[0].revision, 1);
    assert.deepEqual(workspace.items[0].sessions[0].laneIds, ["2"]);
    await ops.moveProgramSession(sql, "zero", {
      ...move,
      laneIds: ["3-4"],
      start: "17:00",
      end: "18:00",
    });
    workspace = await ops.programEvents(sql, "zero", { teamId: "soft" });
    assert.equal(workspace.items[0].sessions[0].revision, 2);
    assert.deepEqual(workspace.items[0].sessions[0].laneIds, ["3-4"]);
    const enrollment = {
      eventId: create.requestId,
      sessionKey: added.sessionKey,
      sessionRevision: 2,
      athleteId: "linked-athlete",
      revision: 0,
      action: "enroll" as const,
      reason: "Confirm eligible roster participant",
    };
    await assert.rejects(ops.saveProgramEnrollment(sql, "zero", enrollment), /Open/);
    await ownerEvents.saveOperationalEventSettings(sql, "owner", {
      eventId: create.requestId,
      revision: 2,
      capacity: 10,
      coachIds: ["event-coach"],
      publication: "open",
      reason: "Owner reviewed event publication",
    });
    await ops.saveProgramEnrollment(sql, "zero", enrollment);
    await assert.rejects(
      ops.saveProgramEnrollment(sql, "zero", { ...enrollment, athleteId: "other-athlete" }),
    );
    await assert.rejects(
      ops.saveProgramEnrollment(sql, "zero", { ...enrollment, revision: 1, action: "check-in" }),
      /waiver/i,
    );
    await sql`insert into club_waivers(id,user_id,athlete_id,version,signer_name,signed_at,consent_text) values('event-waiver','parent','linked-athlete','fixture','Synthetic guardian',now(),'Synthetic consent')`;
    // Advance only the disposable delivery fixture to the check-in day.
    const visitStart = new Date(Math.floor(Date.now() / 300000) * 300000),
      visitEnd = new Date(+visitStart + 3600000);
    await sql`update operational_booking_changes set starts_at=${visitStart.toISOString()},ends_at=${visitEnd.toISOString()} where booking_id=(select booking_id from operational_event_enrollments where event_id=${create.requestId} and athlete_id='linked-athlete')`;

    await ops.saveProgramEnrollment(sql, "zero", {
      ...enrollment,
      revision: 1,
      action: "check-in",
    });
    await assert.rejects(
      ops.moveProgramSession(sql, "zero", { ...move, revision: 2 }),
      /owner review/i,
    );
    await assign(
      "zero",
      "softball",
      ["events.read", "camps.create", "camps.update", "cages.reserve", "events.cancel.request"],
      "teams",
      ["soft"],
    );
    const second = { ...create, requestId: randomUUID(), name: "Cancellation review camp" };
    await ops.createProgramEvent(sql, "zero", second);
    await ops.addProgramSession(sql, "zero", {
      ...session,
      eventId: second.requestId,
      date: "2099-01-13",
      laneIds: ["2"],
    });
    const approvalId = randomUUID();
    await requestApproval(sql, "zero", {
      id: approvalId,
      kind: "cancel-event",
      targetId: second.requestId,
      teamId: "soft",
      destinationTeamId: "",
      reason: "Review a significant program cancellation",
    });
    assert.equal(
      (await sql`select publication from operational_event_records where id=${second.requestId}`)[0]
        .publication,
      "draft",
    );
    await assert.rejects(
      decideApproval(sql, "zero", {
        id: approvalId,
        revision: 1,
        decision: "approved",
        reason: "Cannot self approve",
        confirm: true,
      }),
    );
    await sql`create function fail_program_approval_audit() returns trigger language plpgsql as $$begin if new.action='approval.approved' then raise exception 'injected approval audit failure';end if;return new;end$$`;
    await sql`create trigger fail_program_approval before insert on coordinator_audit for each row execute function fail_program_approval_audit()`;
    await assert.rejects(
      decideApproval(sql, "owner", {
        id: approvalId,
        revision: 1,
        decision: "approved",
        reason: "Owner reviewed cancellation",
        confirm: true,
      }),
      /injected/,
    );
    assert.equal(
      (await sql`select status from coordinator_approvals where id=${approvalId}`)[0].status,
      "pending",
    );
    assert.equal(
      (
        await sql`select status from operational_event_sessions where event_id=${second.requestId}`
      )[0].status,
      "confirmed",
    );
    await sql`drop trigger fail_program_approval on coordinator_audit`;
    await decideApproval(sql, "owner", {
      id: approvalId,
      revision: 1,
      decision: "approved",
      reason: "Owner reviewed cancellation",
      confirm: true,
    });
    assert.equal(
      (await sql`select publication from operational_event_records where id=${second.requestId}`)[0]
        .publication,
      "archived",
    );
    assert.equal(
      (
        await sql`select count(*)::int as n from booking_occupancy where booking_id in(select booking_id from coordinator_event_cages where event_id=${second.requestId})`
      )[0].n,
      0,
    );
    const [assignment] = await sql<{
      revision: number;
    }>`select revision from coordinator_assignments where user_id='zero' and sport='softball'`;
    await saveAssignment(sql, "owner", {
      userId: "zero",
      sport: "softball",
      revision: assignment.revision,
      status: "suspended",
      coverage: "teams",
      teamIds: ["soft"],
      permissions: [],
      confirm: true,
      independentRolesReviewed: true,
    });
    await assert.rejects(ops.programEvents(sql, "zero", { teamId: "soft" }));
    assert.deepEqual(
      await sql`select to_jsonb(o) as state from commerce_orders o order by id`,
      financialBefore,
    );
    assert.equal(
      (await sql`select status from booking_records where id='protected-event-booking'`)[0].status,
      "confirmed",
    );
  } finally {
    await db.close();
  }
});

test("scoped tryouts preserve shared occupancy and require exact owner-reviewed publication with current grants", async () => {
  const { db, sql, assign } = await fixture();
  const ops = await import("./tryout-scheduling.server");
  try {
    await sql`insert into club_staff(id,user_id,name,email,role,active) values('tryout-coach','coach','Synthetic coach','coach@example.invalid','coach',true)`;
    const caps: Capability[] = [
      "events.read",
      "tryouts.create",
      "tryouts.update",
      "events.review.request",
      "events.cancel.request",
      "cages.reserve",
      "cages.update",
      "cages.release",
    ];
    const v = {
      id: randomUUID(),
      revision: 0,
      teamId: "soft",
      season: "Spring 2099",
      ageGroups: ["13U"],
      date: "2099-01-12",
      startTime: "16:00",
      endTime: "17:00",
      location: "Facility",
      capacity: 20,
      coachId: "tryout-coach",
      laneIds: ["1"] as "1"[],
      reason: "Authorized program tryout",
    };
    await assign("zero", "softball");
    await assert.rejects(ops.saveScopedTryout(sql, "zero", v));
    await assign("zero", "softball", caps, "teams", ["soft"]);
    await assert.rejects(ops.saveScopedTryout(sql, "zero", { ...v, teamId: "base" }));
    await ops.saveScopedTryout(sql, "zero", v);
    await ops.saveScopedTryout(sql, "zero", v);
    assert.equal((await sql`select id from tryout_events where id=${v.id}`).length, 1);
    let view = await ops.scopedTryouts(sql, "zero", { teamId: "soft" });
    assert.equal(view.items[0].status, "draft");
    assert.doesNotMatch(JSON.stringify(view), /@|medical|total_cents|household/);
    await assign("baseball", "baseball", caps);
    await assert.rejects(ops.scopedTryouts(sql, "baseball", { teamId: "soft" }));
    const current = { ...v, revision: 1 };
    const review = {
      id: randomUUID(),
      change: current,
      status: "published" as const,
      confirm: true as const,
    };
    await ops.requestTryoutReview(sql, "zero", review);
    await ops.requestTryoutReview(sql, "zero", review);
    assert.equal((await sql`select status from tryout_events where id=${v.id}`)[0].status, "draft");
    await assert.rejects(
      decideApproval(sql, "zero", {
        id: review.id,
        revision: 1,
        decision: "approved",
        reason: "Unauthorized self approval",
        confirm: true,
      }),
    );
    // A previously unscoped applicant must not auto-enroll into this team-bound event.
    await sql`insert into club_requests(id,kind,payload) values('unscoped-applicant','tryout','{"sport":"Softball","season":"Spring 2099","age":"13U","player":"Unrelated applicant","email":"private@example.invalid","autoEnroll":true}')`;
    await decideApproval(sql, "owner", {
      id: review.id,
      revision: 1,
      decision: "approved",
      reason: "Reviewed exact event publication",
      confirm: true,
    });
    assert.equal(
      (await sql`select status from tryout_events where id=${v.id}`)[0].status,
      "published",
    );
    assert.equal((await sql`select id from tryout_enrollments where event_id=${v.id}`).length, 0);
    await assert.rejects(
      ops.saveScopedTryout(sql, "zero", { ...current, revision: 2 }),
      /owner review/,
    );
    const protectedOrder = "protected-tryout-order";
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status) values(${protectedOrder},${protectedOrder},'private@example.invalid','fixture-cage','cage','{}',9999,'paid')`;
    await sql`insert into booking_records(id,order_id,product_id,starts_at,ends_at,resources,status) values('protected-tryout-booking',${protectedOrder},'fixture-cage','2099-01-12T23:00:00Z','2099-01-13T00:00:00Z','["lane:1"]','confirmed')`;
    await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values('lane:1','2099-01-12T23:00:00Z','protected-tryout-booking')`;
    const finances = await sql`select to_jsonb(o) as state from commerce_orders o order by id`;
    const move = {
      id: randomUUID(),
      change: { ...v, revision: 2, startTime: "17:00", endTime: "18:00" },
      status: "published" as const,
      confirm: true as const,
    };
    await ops.requestTryoutReview(sql, "zero", move);
    const before = await sql`select * from booking_occupancy order by resource_id,slot_at`;
    await assert.rejects(
      decideApproval(sql, "owner", {
        id: move.id,
        revision: 1,
        decision: "approved",
        reason: "Check protected occupancy",
        confirm: true,
      }),
      /reserved|conflict/,
    );
    assert.deepEqual(
      await sql`select * from booking_occupancy order by resource_id,slot_at`,
      before,
    );
    assert.equal(
      (await sql`select status from coordinator_approvals where id=${move.id}`)[0].status,
      "pending",
    );
    const enrolledId = randomUUID();
    await sql`insert into club_requests(id,kind,payload) values('scoped-applicant','tryout','{"sport":"Softball","season":"Spring 2099","age":"13U","player":"Scoped applicant","email":"family@example.invalid","preferredTeamId":"soft"}')`;
    await sql`insert into tryout_enrollments(id,event_id,request_id,applicant_key,status) values(${enrolledId},${v.id},'scoped-applicant','scoped-key','enrolled')`;
    const valid = {
      ...move,
      id: randomUUID(),
      change: { ...move.change, laneIds: ["2"] as ("1" | "2")[] },
    };
    await ops.requestTryoutReview(sql, "zero", valid);
    // Revocation between request and execution prevents any side effect.
    await assign("zero", "softball", ["events.read"], "teams", ["soft"]);
    await assert.rejects(
      decideApproval(sql, "owner", {
        id: valid.id,
        revision: 1,
        decision: "approved",
        reason: "Check current permission revocation",
        confirm: true,
      }),
    );
    await assign("zero", "softball", caps, "teams", ["soft"]);
    await sql`create function fail_tryout_approval_audit() returns trigger language plpgsql as $$begin if new.action='approval.approved' then raise exception 'injected tryout audit failure';end if;return new;end$$`;
    await sql`create trigger fail_tryout_approval before insert on coordinator_audit for each row execute function fail_tryout_approval_audit()`;
    await assert.rejects(
      decideApproval(sql, "owner", {
        id: valid.id,
        revision: 1,
        decision: "approved",
        reason: "Check atomic notice rollback",
        confirm: true,
      }),
      /injected tryout/,
    );
    assert.equal(
      (await sql`select id from tryout_notification_outbox where enrollment_id=${enrolledId}`)
        .length,
      0,
    );
    assert.equal((await sql`select revision from tryout_events where id=${v.id}`)[0].revision, 2);
    await sql`drop trigger fail_tryout_approval on coordinator_audit`;
    await decideApproval(sql, "owner", {
      id: valid.id,
      revision: 1,
      decision: "approved",
      reason: "Move to available cage",
      confirm: true,
    });
    assert.equal(
      (
        await sql`select kind from tryout_notification_outbox where enrollment_id=${enrolledId} and status='pending'`
      )[0].kind,
      "updated",
    );

    view = await ops.scopedTryouts(sql, "zero", { teamId: "soft" });
    assert.deepEqual(view.items[0].laneIds, ["2"]);
    assert.equal(view.items[0].revision, 3);
    assert.equal(
      (
        await sql`select booking_id from booking_occupancy where resource_id='lane:1' and slot_at='2099-01-12T22:00:00Z'`
      ).length,
      0,
    );
    await assert.rejects(
      decideApproval(sql, "owner", {
        id: move.id,
        revision: 1,
        decision: "approved",
        reason: "Stale schedule must reject",
        confirm: true,
      }),
      /changed/,
    );
    const cancel = {
      id: randomUUID(),
      change: { ...valid.change, revision: 3 },
      status: "cancelled" as const,
      confirm: true as const,
    };
    await ops.requestTryoutReview(sql, "zero", cancel);
    await decideApproval(sql, "owner", {
      id: cancel.id,
      revision: 1,
      decision: "approved",
      reason: "Cancel approved program tryout",
      confirm: true,
    });
    assert.equal(
      (await sql`select status from tryout_events where id=${v.id}`)[0].status,
      "cancelled",
    );
    assert.equal(
      (await sql`select event_id from tryout_event_reservations where event_id=${v.id}`).length,
      0,
    );
    assert.deepEqual(
      await sql`select to_jsonb(o) as state from commerce_orders o order by id`,
      finances,
    );
  } finally {
    await db.close();
  }
});

test("audit snapshots retain event-time roles and request correlation while owner filters minimize legacy activity", async () => {
  const { db, sql, assign } = await fixture();
  const { audit } = await import("./access.server");
  const { activityWorkspace } = await import("./admin.server");
  try {
    await assign("zero", "softball", ["rosters.read"], "teams", ["soft"]);
    await secured(sql, "zero", "synthetic.related", async (tx) => {
      await audit(
        tx,
        "zero",
        "synthetic.first",
        "soft-player",
        "allowed",
        { before: { number: "1" }, after: { number: "2" } },
        "softball",
        "soft",
      );
      await audit(tx, "zero", "synthetic.second", "soft-player", "allowed", {}, "softball", "soft");
    });
    const rows = await sql<{
      correlation_id: string;
      actor_roles: { role: string; sport?: string; status?: string; teamIds?: string[] }[];
    }>`select correlation_id,actor_roles from coordinator_audit where action in ('synthetic.first','synthetic.second') order by id`;
    assert.equal(rows[0].correlation_id, rows[1].correlation_id);
    const mirror = await sql<{
      correlation_id: string;
    }>`select correlation_id from audit_events where action='synthetic.first'`;
    assert.equal(mirror[0].correlation_id, rows[0].correlation_id);
    assert.equal(
      rows[0].actor_roles.some(
        (r) =>
          r.role === "softball_coordinator" && r.status === "active" && r.teamIds?.[0] === "soft",
      ),
      true,
    );
    const [grant] = await sql<{
      revision: number;
    }>`select revision from coordinator_assignments where user_id='zero' and sport='softball'`;
    await saveAssignment(sql, "owner", {
      userId: "zero",
      sport: "softball",
      revision: grant.revision,
      status: "suspended",
      coverage: "teams",
      teamIds: ["soft"],
      permissions: [],
      confirm: true,
      independentRolesReviewed: true,
    });
    assert.deepEqual(
      (await sql`select actor_roles from coordinator_audit where action='synthetic.first'`)[0]
        .actor_roles,
      rows[0].actor_roles,
    );
    await sql`insert into audit_events(actor_id,action,target_table,target_id,after_state) values('owner','UPDATE','club_athletes','synthetic-athlete','{"medical":"PRIVATE-MEDICAL","payment":"PRIVATE-PAYMENT","message":"PRIVATE-MESSAGE"}')`;
    await assert.rejects(activityWorkspace(sql, "zero"));
    await assert.rejects(activityWorkspace(sql, "fake"));
    const filtered = await activityWorkspace(sql, "owner", {
      actor: "zero",
      sport: "softball",
      teamId: "soft",
      action: "synthetic.second",
      targetId: "soft-player",
      result: "allowed",
    });
    assert.equal(filtered.events.length, 1);
    assert.equal(filtered.events[0].action, "synthetic.second");
    assert.equal(filtered.otherActivity.length, 0);
    assert.equal(
      (
        await activityWorkspace(sql, "owner", {
          action: "synthetic.second",
          before: "2000-01-01T00:00:00Z",
        })
      ).events.length,
      0,
    );
    const all = await activityWorkspace(sql, "owner");
    assert.equal(
      all.otherActivity.some((r) => r.target_id === "synthetic-athlete"),
      true,
    );
    assert.doesNotMatch(JSON.stringify(all.otherActivity), /PRIVATE|after_state|before_state/);
    await assert.rejects(
      sql`update coordinator_audit set actor_roles='[]' where action='synthetic.first'`,
    );
  } finally {
    await db.close();
  }
});

test("risk checks run before morning reports, use bounded owner settings and deduplicate transactional private alerts", async () => {
  const { db, sql, assign } = await fixture();
  const { runCoordinatorRiskChecks } = await import("./risk-reviews.server");
  const { coordinatorAccessReviews, saveCoordinatorReviewPolicy } =
    await import("./reviews.server");
  try {
    await assign("zero", "softball", ["rosters.number", "contacts.read"]);
    const policy = (await coordinatorAccessReviews(sql, "owner")).policy;
    await saveCoordinatorReviewPolicy(sql, "owner", {
      ...policy,
      rosterChangeThreshold: 2,
      contactReadThreshold: 3,
      riskWindowHours: 24,
    });
    for (const action of [
      "rosters.number",
      "rosters.positions",
      "contacts.read",
      "protected.request-rejected",
    ])
      await sql`insert into coordinator_audit(actor_id,action,result,details,correlation_id,created_at) values('zero',${action},${action.startsWith("protected") ? "denied" : "allowed"},'{"count":4}',${randomUUID()},'2030-04-05T12:00:00Z')`;
    const now = new Date("2030-04-05T12:30:00Z"); // Before 8am Chicago; risk checks must still run.
    await sql`create function fail_risk_outbox() returns trigger language plpgsql as $$begin if new.id like 'coordinator-risk:%' then raise exception 'injected risk delivery failure';end if;return new;end$$`;
    await sql`create trigger risk_outbox_failure before insert on site_alert_deliveries for each row execute function fail_risk_outbox()`;
    await assert.rejects(runCoordinatorRiskChecks(sql, now), /injected risk/);
    assert.equal((await sql`select id from coordinator_risk_alerts`).length, 0);
    await sql`drop trigger risk_outbox_failure on site_alert_deliveries`;
    const first = await runCoordinatorRiskChecks(sql, now);
    assert.equal(first.created, 3);
    assert.equal((await runCoordinatorRiskChecks(sql, now)).created, 0);
    const messages = await sql<{
      recipient: string;
      audience: string;
      body: string;
    }>`select recipient,audience,body from site_alert_deliveries where id like 'coordinator-risk:%'`;
    assert.equal(
      messages.every(
        (m) => m.recipient === "owner@example.invalid" && m.audience === "coordinator-owners",
      ),
      true,
    );
    assert.doesNotMatch(JSON.stringify(messages), /zero|PRIVATE|555|household/);
    await assert.rejects(sql`delete from coordinator_risk_alerts`);
    await sql`alter table coordinator_audit disable trigger coordinator_audit_roles`;
    assert.equal((await runCoordinatorRiskChecks(sql, now)).created, 1);
    assert.equal(
      (
        await sql`select priority from coordinator_risk_alerts where code='audit-protection-missing'`
      )[0].priority,
      "critical",
    );
    await sql`alter table coordinator_audit enable trigger coordinator_audit_roles`;
    await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
    assert.equal(
      (await runCoordinatorRiskChecks(sql, new Date("2030-04-06T12:30:00Z"))).created,
      0,
    );
  } finally {
    await db.close();
  }
});
