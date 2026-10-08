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
  club.notifications = [
    { id: "owner", ts: 1, teamId: team.id, title: "Owner private", body: "Confidential", kind: "alert", audience: "admin" },
    { id: "staff", ts: 2, teamId: team.id, title: "Coach private", body: "Confidential", kind: "alert", audience: "coach" },
    { id: "family", ts: 3, teamId: team.id, title: "One household", body: "Private family notification", kind: "chase", audience: "family" },
    { id: "general", ts: 4, teamId: team.id, title: "Facility update", body: "Cages open", kind: "alert", audience: "all" },
    { id: "price", ts: 5, teamId: team.id, title: "Team budget", body: "$250 entry fee", kind: "alert", audience: "all" },
    { id: "other-team", ts: 6, teamId: "unknown-team", title: "Not on team", body: "Elsewhere", kind: "alert", audience: "all" },
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
