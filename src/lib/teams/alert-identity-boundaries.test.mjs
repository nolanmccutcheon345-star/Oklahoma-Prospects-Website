import assert from "node:assert/strict";
import test from "node:test";
import { seedState } from "./engine/04-seed.js";
import { alertsForRole, buildAlerts } from "./ops.ts";
import { scopeClub } from "./scope.ts";

function household() {
  const club = seedState();
  const team = club.teams.find((t) => t.roster.some((p) => p.familyId)) || club.teams[0];
  const own = team.roster.find((p) => p.familyId);
  const other = team.roster.find((p) => p.familyId && p.familyId !== own.familyId);
  assert.ok(own && other, "need two separate families on the same team");
  return { club, team, own, other };
}

test("name collisions cannot reveal another family's alerts", () => {
  const { club, team, own, other } = household();
  other.name = own.name;
  // Build genuine operations alerts, not just mocked filter inputs.
  const raw = buildAlerts(club);
  assert.ok(raw.some((a) => a.playerId === other.id));
  const role = alertsForRole(club, "parent", {
    teamId: team.id,
    familyId: own.familyId,
    playerId: own.id,
  });
  assert.ok(role.every((a) => a.playerId && a.playerId !== other.id));
  assert.ok(role.every((a) => a.playerId === own.id || team.roster.some(
    (p) => p.id === a.playerId && p.familyId === own.familyId,
  )));
  assert.deepEqual(alertsForRole(club, "parent", {
    teamId: team.id, familyId: null, playerId: own.id,
  }), []);
});

test("scoped family alerts require an exact player and team match", () => {
  const { club, team, own, other } = household();
  other.name = own.name;
  const otherTeam = club.teams.find((t) => t.id !== team.id);
  const ownAlert = { kind: "Docs", teamId: team.id, playerId: own.id, text: own.name + " needs paperwork" };
  const foreignAlert = { kind: "Emergency", teamId: team.id, playerId: other.id, text: own.name + " needs medical review" };
  const forgedTeam = { kind: "Docs", teamId: otherTeam?.id || "nonexistent", playerId: own.id, text: own.name };
  const teamMessage = { kind: "Schedule", teamId: team.id, text: "Team practice" };
  const alerts = [ownAlert, foreignAlert, forgedTeam, teamMessage];
  const parent = scopeClub(club, {
    role: "parent", email: "", teamId: team.id, familyId: own.familyId, playerId: own.id,
  }, alerts);
  assert.deepEqual(parent.alerts, [ownAlert]);
  const player = scopeClub(club, {
    role: "player", email: own.email || "", teamId: team.id, familyId: own.familyId, playerId: own.id,
  }, alerts);
  assert.deepEqual(player.alerts, [ownAlert, teamMessage]);
  const unlinked = scopeClub(club, {
    role: "player", email: "", teamId: team.id, familyId: own.familyId, playerId: null,
  }, alerts);
  assert.deepEqual(unlinked.alerts, []);
  assert.deepEqual(alertsForRole(club, "player", {
    teamId: null, familyId: own.familyId, playerId: own.id,
  }), []);
});

test("owner, coach, and targeted family notices stay out of unrelated snapshots", () => {
  const { club, team, own } = household();
  const foreignTeam = club.teams.find(
    (t) => t.id !== team.id && !t.roster.some((p) => p.familyId === own.familyId),
  );
  assert.ok(foreignTeam, "need an unrelated real team");
  club.notifications = [
    { id: "owner", ts: 1, teamId: team.id, title: "Owner private", body: "Confidential", kind: "alert", audience: "admin" },
    { id: "staff", ts: 2, teamId: team.id, title: "Coach private", body: "Confidential", kind: "alert", audience: "coach" },
    { id: "family", ts: 3, teamId: team.id, title: "One household", body: "Private family notification", kind: "chase", audience: "family" },
    { id: "general", ts: 4, teamId: team.id, title: "Facility update", body: "Cages open", kind: "alert", audience: "all" },
    { id: "price", ts: 5, teamId: team.id, title: "Team budget", body: "$250 entry fee", kind: "alert", audience: "all" },
    { id: "other-team", ts: 6, teamId: foreignTeam.id, title: "Not on team", body: "Elsewhere", kind: "alert", audience: "all" },
  ];
  const who = { email: own.email || "", teamId: team.id, familyId: own.familyId, playerId: own.id };
  const parent = scopeClub(club, { ...who, role: "parent" });
  const player = scopeClub(club, { ...who, role: "player" });
  const coach = scopeClub(club, { ...who, role: "coach" });
  const admin = scopeClub(club, { ...who, role: "admin" });
  assert.deepEqual(parent.state.notifications.map((n) => n.id), ["general"]);
  assert.deepEqual(player.state.notifications.map((n) => n.id), ["general"]);
  assert.deepEqual(coach.state.notifications.map((n) => n.id), ["staff", "general", "price"]);
  assert.equal(admin.state.notifications.length, 6);
});

test("scoped snapshots omit other families' booking usage and owner-only records", () => {
  const { club, team, own, other } = household();
  const unrelated = club.teams.find((t) =>
    t.id !== team.id && !t.roster.some((p) => p.familyId === own.familyId),
  );
  assert.ok(unrelated);
  club.bookings = [
    { scope: "player", ownerId: own.id, week: "2026-10-04", hours: 1 },
    { scope: "player", ownerId: other.id, week: "2026-10-04", hours: 2 },
    { scope: "team", ownerId: team.id, week: "2026-10-04", hours: 3 },
    { scope: "team", ownerId: unrelated.id, week: "2026-10-04", hours: 4 },
  ];
  club.archive = [{ teamId: team.id, name: team.name, seasonLabel: "Prior", closedAt: "2026-08-01", realized: 10000, roster: [] }];
  club.disruptions = [{ confidential: "owner notes" }];
  club.onboarding = { staffOnly: "private" };
  club.cancelled = [
    { id: "mine", teamId: team.id, eventId: "ev1", name: "Team event", month: "2026-10", at: "2026-10-08", reason: "Weather" },
    { id: "theirs", teamId: unrelated.id, eventId: "ev2", name: "Other event", month: "2026-10", at: "2026-10-08", reason: "Weather" },
  ];
  const who = { email: own.email || "", teamId: team.id, familyId: own.familyId, playerId: own.id };
  for (const role of ["parent", "player"]) {
    const view = scopeClub(club, { ...who, role }).state;
    assert.deepEqual(view.bookings.map((b) => b.ownerId), [own.id, team.id]);
    assert.deepEqual(view.archive, []);
    assert.deepEqual(view.disruptions, []);
    assert.deepEqual(view.onboarding, {});
    assert.deepEqual(view.cancelled.map((e) => e.id), ["mine"]);
  }
  const coach = scopeClub(club, { ...who, role: "coach" }).state;
  assert.deepEqual(coach.bookings.map((b) => b.ownerId), [own.id, other.id, team.id]);
  assert.deepEqual(coach.archive, []);
  const admin = scopeClub(club, { ...who, role: "admin" }).state;
  assert.equal(admin.bookings.length, 4);
  assert.equal(admin.archive[0].realized, 10000);
});
