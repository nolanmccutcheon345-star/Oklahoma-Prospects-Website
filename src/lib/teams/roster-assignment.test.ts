import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { enrollmentFixture } from "../enrollment/test-fixture";
import { approveSyntheticNotices } from "../notifications/release-control.test-fixture";
import {
  calculateFees,
  defaultBudget,
  feeComposition,
  installments,
  type FeeBudget,
} from "./fee-model";
import { mutateFeePlan } from "./fee.server";
import { deliverFeeReadyEmails, queueFeeReadyInTransaction } from "./fee-notifications.server";
import { withFinancialContext } from "../finance/context.server";
import { readStoredClub } from "./club-store.server";
import {
  assignToTeam,
  listAssignableCandidates,
  setAssignmentStatus,
} from "./roster-assignment.server";
import { activeRosterGuardianUserIds, teamAnnouncementRecipientIds } from "./recipients.server";
import type { Sql } from "../db";

const env = {
  CONTEXT: "production",
  SQUARE_DEPLOY_CONTEXT: "production",
  RESEND_API_KEY: "synthetic",
  RESEND_FROM_EMAIL: "office@example.invalid",
};
const budget = (): FeeBudget => ({
  ...defaultBudget(),
  fundingModel: "independent",
  policy: "Synthetic payment, withdrawal and refund policy.",
  processingBps: 0,
  processingFixed: 0,
  parentExplanation: {
    initialDeposit: "PUBLIC uniform and coaching coverage",
    monthlyDues: "PUBLIC facility dues",
    teamExpenses: "PUBLIC independent tournament expenses",
    additionalNotes: "Planned fundraising is arranged by the coach.",
  },
  independent: {
    seasonKey: randomUUID(),
    uniformDeposit: 70000,
    monthlyDues: 14900,
    uniformDue: "2098-01-01",
    firstDue: "2098-02-01",
    billingDay: 1,
    lastDue: "2098-06-01",
    seasonEnd: "2098-06-30",
    processingExplanation: "No additional processing fee.",
  },
});

async function athlete(sql: Sql, id: string, household: string | null, email = "guardian@example.invalid") {
  await sql`insert into club_athletes(id,household_email,name,household_id) values(${id},${email},${"Synthetic " + id},${household})`;
}
async function team(sql: Sql, id: string) {
  const club = await readStoredClub(sql);
  return club!.teams.find((t) => t.id === id)!;
}
const account = (teamId: string, athleteId: string, extra: Record<string, unknown> = {}) => ({
  teamId,
  source: { kind: "account" as const, athleteId },
  rosterRole: "full" as const,
  ...extra,
});

test("only Front Office can list, assign or change roster assignments", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    await athlete(sql, "ath-1", "home-guardian");
    for (const user of ["coach", "othercoach", "guardian", "stranger", "player", "coordinator", "fake", "nobody"]) {
      await assert.rejects(assignToTeam(sql, user, account("base", "ath-1")), /front office|owner|access|not|unauthorized/i, user);
      await assert.rejects(listAssignableCandidates(sql, user, "base"), /front office|owner|access|not|unauthorized/i, user);
      await assert.rejects(
        setAssignmentStatus(sql, user, { teamId: "base", playerId: "base-player", status: "removed" }),
        /front office|owner|access|not|unauthorized/i,
        user,
      );
    }
    assert.equal((await sql`select * from roster_assignments`).length, 0);
    const result = await assignToTeam(sql, "owner", account("base", "ath-1"));
    assert.equal(result.ok, true);
    const rows = await sql`select status,source from roster_assignments`;
    assert.deepEqual(rows.map((r) => [r.status, r.source]), [["active", "account"]]);
    assert.equal((await sql`select * from roster_assignment_audit`).length, 1);
    await assert.rejects(sql`update roster_assignment_audit set reason='tampered'`);
    await assert.rejects(sql`delete from roster_assignment_audit`);
  } finally {
    await db.close();
  }
});

test("a second live team is refused unless Front Office records a reason", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    await athlete(sql, "ath-2", "home-guardian");
    await assignToTeam(sql, "owner", account("base", "ath-2"));
    await assert.rejects(assignToTeam(sql, "owner", account("soft", "ath-2")), /already on .*reason/i);
    await assert.rejects(
      assignToTeam(sql, "owner", account("soft", "ath-2", { additionalTeamReason: "short" })),
      /reason/i,
    );
    assert.equal((await team(sql, "soft")).roster.length, 1);
    await assignToTeam(
      sql,
      "owner",
      account("soft", "ath-2", { additionalTeamReason: "Plays both programs this season." }),
    );
    const [row] = await sql`select additional_team_reason from roster_assignments where team_id='soft'`;
    assert.equal(row.additional_team_reason, "Plays both programs this season.");
    await assert.rejects(assignToTeam(sql, "owner", account("base", "ath-2")), /already assigned/);
  } finally {
    await db.close();
  }
});

test("guardian contact comes from the household, never typed input or a player account", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    await assert.rejects(
      assignToTeam(sql, "owner", { ...account("base", "x"), parentEmail: "typed@example.invalid" } as never),
    );
    await sql`insert into club_athletes(id,household_email,name) values('orphan','',${"Synthetic orphan"})`;
    await assert.rejects(assignToTeam(sql, "owner", account("base", "orphan")), /guardian household/i);
    await sql`insert into club_households(id,primary_email) values('home-player','player@example.invalid')`;
    await athlete(sql, "self", "home-player", "player@example.invalid");
    await assert.rejects(assignToTeam(sql, "owner", account("base", "self")), /player account/i);
    await athlete(sql, "ath-3", null);
    const assigned = await assignToTeam(sql, "owner", account("base", "ath-3"));
    const playerId = "playerId" in assigned ? assigned.playerId : "";
    assert.ok(playerId);
    const p = (await team(sql, "base")).roster.find((r) => r.id === playerId)!;
    assert.equal(p.familyId, "home-guardian");
    assert.deepEqual(p.parents.map((g) => g.email), ["guardian@example.invalid"]);
    assert.equal(p.email, "");
    const invites = await sql`select email,family_id from club_invites where team_id='base'`;
    assert.deepEqual(invites.map((i) => [i.email, i.family_id]), [["guardian@example.invalid", "home-guardian"]]);
    const listed = await listAssignableCandidates(sql, "owner", "base");
    assert.doesNotMatch(JSON.stringify(listed), /@|birth|allerg/i, "picker never carries contact or medical data");
    assert.ok(listed.members.some((m) => m.playerId === playerId && m.status === "active"));
  } finally {
    await db.close();
  }
});

test("removal stops queued and future fee notices; only active members of that team are recipients", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    const id = randomUUID();
    await sql`insert into club_invites(id,token_hash,email,role,family_id,team_id,invited_by,expires_at) values(${id},${id},'guardian@example.invalid','parent','home-guardian','base','owner',now()+interval '7 days')`;
    await mutateFeePlan(sql, "owner", {
      action: "publishIndependent",
      teamId: "base",
      revision: 0,
      budget: budget(),
      confirmed: true,
    });
    const queued = await sql`select team_id,player_id,status from fee_ready_notifications`;
    assert.deepEqual(queued.map((r) => [r.team_id, r.player_id]), [["base", "base-player"]]);
    await setAssignmentStatus(sql, "owner", {
      teamId: "base",
      playerId: "base-player",
      status: "removed",
      reason: "Synthetic removal",
    });
    await approveSyntheticNotices(sql, "fee", env);
    let sends = 0;
    const send: typeof fetch = async () => {
      sends++;
      return new Response(JSON.stringify({ id: "synthetic-provider" }));
    };
    await deliverFeeReadyEmails(sql, env, send);
    assert.equal(sends, 0, "a removed player's guardian is never emailed");
    assert.notEqual((await sql`select status from fee_ready_notifications`)[0].status, "accepted");
    await withFinancialContext(sql, "owner", "owner", (tx) =>
      queueFeeReadyInTransaction(tx, "owner", { teamId: "base" }),
    );
    assert.equal(
      (await sql`select * from fee_ready_notifications where status in ('queued','approved','pending')`).length,
      0,
    );
    const base = await team(sql, "base");
    assert.deepEqual(await withFinancialContext(sql, "owner", "read", (tx) => activeRosterGuardianUserIds(tx, base)), []);
  } finally {
    await db.close();
  }
});

test("team announcements reach only that team's active members' guardians, never coach households", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    await sql`insert into household_members(household_id,user_id) values('home-coach','stranger')`.catch(() => undefined);
    await sql`insert into club_households(id,primary_email) values('home-coach','coach@example.invalid') on conflict do nothing`;
    await sql`insert into household_members(household_id,user_id) values('home-coach','stranger') on conflict do nothing`;
    const base = await team(sql, "base");
    const ids = await sql.transaction((tx) => teamAnnouncementRecipientIds(tx, base));
    assert.ok(ids.includes("guardian"));
    assert.ok(ids.includes("coach"));
    assert.ok(!ids.includes("stranger"), "a coach's household member is not a recipient");
    assert.ok(!ids.includes("othercoach"), "another team's coach is not a recipient");
    await setAssignmentStatus(sql, "owner", { teamId: "soft", playerId: "soft-player", status: "removed" });
    const soft = await team(sql, "soft");
    const softIds = await sql.transaction((tx) => teamAnnouncementRecipientIds(tx, soft));
    assert.ok(!softIds.includes("guardian"), "a removed member's guardian gets no announcements");
    assert.ok(softIds.includes("othercoach"));
  } finally {
    await db.close();
  }
});

test("migration 0120 backfill is idempotent and treats withdrawn entries as removed", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    const raw = readFileSync("migrations/0120_roster_assignments.sql", "utf8");
    const club = await readStoredClub(sql);
    club!.teams[1].roster[0].withdrawn = true;
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    await db.exec(raw);
    await db.exec(raw);
    const rows = await sql`select team_id,status,source from roster_assignments order by team_id`;
    assert.deepEqual(
      rows.map((r) => [r.team_id, r.status, r.source]),
      [
        ["base", "active", "backfill"],
        ["soft", "removed", "backfill"],
      ],
    );
    assert.equal((await sql`select * from roster_assignment_audit`).length, 2);
  } finally {
    await db.close();
  }
});

test("fee math is unchanged: 15% contingency, deposits, organization fee and Square processing", async () => {
  const b = defaultBudget();
  Object.assign(b, {
    contingencyBps: 1500,
    processingBps: 290,
    processingFixed: 30,
    fullOrg: 25000,
    poOrg: 15000,
    uniformCost: 9000,
    tournament: 120000,
  });
  b.costs[0].cents = 200000;
  const f = calculateFees(b);
  assert.deepEqual(
    { contingency: f.contingency, protectedBudget: f.protectedBudget, full: f.full, po: f.po, fullProcessing: f.fullProcessing, poProcessing: f.poProcessing, fullNet: f.fullNet, poNet: f.poNet },
    { contingency: 129000, protectedBudget: 989000, full: 127694, po: 117396, fullProcessing: 3794, poProcessing: 3496, fullNet: 123900, poNet: 113900 },
  );
  assert.deepEqual(feeComposition(b, "full"), { teamCosts: 41000, contingency: 12900, membership: 45000, organization: 25000, processing: 3794, adjustment: 0, total: 127694, contribution: 70000 });
  assert.deepEqual(feeComposition(b, "po"), { teamCosts: 41000, contingency: 12900, membership: 45000, organization: 15000, processing: 3496, adjustment: 0, total: 117396, contribution: 60000 });
  assert.deepEqual(installments(f.full), [51078, 38308, 38308]);

  const { sql, db } = await enrollmentFixture();
  try {
    await mutateFeePlan(sql, "owner", { action: "publishIndependent", teamId: "base", revision: 0, budget: budget(), confirmed: true });
    const { feeWorkspace } = await import("./fee.server");
    const money = async () => {
      const w = JSON.parse(JSON.stringify(await feeWorkspace(sql, "owner")));
      return JSON.stringify(w.teams.find((t: { id: string }) => t.id === "base"), (k, v) => (/rev|At$|savedAt/i.test(k) ? undefined : v));
    };
    const before = await money();
    await athlete(sql, "ath-snap", "home-guardian");
    await assignToTeam(sql, "owner", account("soft", "ath-snap", { additionalTeamReason: "Synthetic cross-team snapshot." }));
    const added = (await team(sql, "soft")).roster.find((p) => p.name === "Synthetic ath-snap")!;
    await setAssignmentStatus(sql, "owner", { teamId: "soft", playerId: added.id, status: "removed" });
    assert.equal(await money(), before, "assignment work on another team never changes this team's fee numbers");
  } finally {
    await db.close();
  }
});

test("a tryout registration is offered then assigned through the same audited path", async () => {
  const { sql, db } = await enrollmentFixture();
  try {
    const club = await readStoredClub(sql);
    const base = club!.teams.find((t) => t.id === "base")!;
    base.seasonEnd = "2098-06-30";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb where id='oklahoma-prospects'`;
    await sql`insert into club_requests(id,kind,payload) values('tryout-1','tryout',${JSON.stringify({ player: "Synthetic tryout", parent: "Guardian", email: "guardian@example.invalid", sport: "baseball", age: base.age })}::jsonb)`;
    const listed = await listAssignableCandidates(sql, "owner", "base");
    assert.deepEqual(listed.registrations.map((r) => r.id), ["tryout-1"]);
    const { reviewTeamInquiryForOffice } = await import("./roster-assignment.server");
    await reviewTeamInquiryForOffice(sql, "owner", { id: "tryout-1", teamId: "base", stage: "offer", rosterRole: "full" });
    assert.deepEqual((await sql`select status,roster_player_id from roster_assignments`).map((r) => [r.status, r.roster_player_id]), [["invited", null]]);
    await assert.rejects(assignToTeam(sql, "coach", { teamId: "base", source: { kind: "registration", requestId: "tryout-1" }, rosterRole: "full" }), /front office|unauthorized/i);
    await assignToTeam(sql, "owner", { teamId: "base", source: { kind: "registration", requestId: "tryout-1" }, rosterRole: "full" });
    const rows = await sql`select status,request_id,roster_player_id from roster_assignments`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "active");
    assert.equal(rows[0].request_id, "tryout-1");
    const placed = (await team(sql, "base")).roster.find((p) => p.id === rows[0].roster_player_id)!;
    assert.equal(placed.familyId, "home-guardian");
    assert.equal((await listAssignableCandidates(sql, "owner", "base")).registrations.length, 0);
    assert.deepEqual((await sql`select action from roster_assignment_audit order by id`).map((r) => r.action), ["offer", "assign"]);
  } finally {
    await db.close();
  }
});
