import test from "node:test";
import assert from "node:assert/strict";
import { sampleClub } from "./seed";
import { staffTeamRosterView } from "./staff-roster";
import { publicTeamsView } from "./public-view";
import { ROSTER_CONSENT_TEXT, ROSTER_CONSENT_VERSION } from "../roster-consent";

function fixture() {
  const club = sampleClub();
  club._demo = false;
  const team = club.teams[0];
  team.coachEmail = "head@example.invalid";
  team.staff = [{ ...team.staff[0], email: "assistant@example.invalid" }];
  for (const [index, player] of team.roster.entries()) {
    player.name = `Synthetic athlete ${index + 1}`;
    player.rosterConsent = undefined;
    player.withdrawn = false;
  }
  return { club, team };
}

const owner = { role: "admin", email: "owner@example.invalid" };

test("owner staff roster includes unconsented and withdrawn records without publishing them", () => {
  const { club, team } = fixture();
  team.roster[1].withdrawn = true;
  const before = structuredClone(club);
  const view = staffTeamRosterView(club, team.id, owner)!;
  assert.equal(view.teamId, team.id);
  assert.equal(view.teamName, team.name);
  assert.deepEqual(
    view.players.map((p) => p.id),
    team.roster.map((p) => p.id),
  );
  assert.equal(view.players.find((p) => p.id === team.roster[1].id)?.withdrawn, true);
  assert.deepEqual(publicTeamsView(club).find((t) => t.id === team.id)?.players, []);
  assert.deepEqual(club, before, "reading does not change roster records or consent");
});

test("staff projection contains only player identity and withdrawal state, never private contact or finance data", () => {
  const { club, team } = fixture();
  team.roster[0].emergency.notes = "SYNTHETIC_MEDICAL_SECRET";
  team.roster[0].parents[0].email = "synthetic-private-parent@example.invalid";
  const view = staffTeamRosterView(club, team.id, owner)!;
  assert.deepEqual(Object.keys(view).sort(), ["players", "teamId", "teamName"]);
  for (const player of view.players) {
    assert.deepEqual(Object.keys(player).sort(), ["id", "name", "number", "withdrawn"]);
  }
  const json = JSON.stringify(view);
  for (const secret of [
    "SYNTHETIC_MEDICAL_SECRET",
    "synthetic-private-parent@example.invalid",
    "familyId",
    "parents",
    "email",
    "feeLock",
    "planLock",
    "payments",
    "rosterConsent",
  ]) {
    assert(!json.includes(secret), secret);
  }
});

test("anonymous, household membership, and an unassigned coach do not authorize the private roster", () => {
  const { club, team } = fixture();
  assert.equal(staffTeamRosterView(club, team.id, null), null);
  for (const viewer of [
    { role: "parent", email: team.roster[0].parents[0].email },
    { role: "player", email: team.roster[0].email },
    { role: "parent", email: "unrelated@example.invalid" },
    { role: "coach", email: "unassigned@example.invalid", canTeamCoach: true },
    { role: "coordinator", email: "coordinator@example.invalid" },
    { role: "coordinator", email: team.coachEmail, canTeamCoach: true },
    { role: "player", email: team.coachEmail, canTeamCoach: true },
  ]) {
    assert.equal(staffTeamRosterView(club, team.id, viewer), null, viewer.role);
  }
});

test("verified head and assistant assignments authorize only their own team", () => {
  const { club, team } = fixture();
  for (const viewer of [
    { role: "coach", email: " HEAD@EXAMPLE.INVALID " },
    { role: "coach", email: " ASSISTANT@EXAMPLE.INVALID " },
    { role: "parent", email: "head@example.invalid", canTeamCoach: true },
  ]) {
    assert(staffTeamRosterView(club, team.id, viewer));
    assert.equal(staffTeamRosterView(club, club.teams[1].id, viewer), null);
  }
  assert.equal(
    staffTeamRosterView(club, team.id, {
      role: "parent",
      email: team.coachEmail,
      canTeamCoach: false,
    }),
    null,
  );
  assert.equal(staffTeamRosterView(club, team.id, { role: "coach", email: "" }), null);
  const coach = { role: "coach", email: team.coachEmail };
  team.coachEmail = "replacement@example.invalid";
  assert.equal(
    staffTeamRosterView(club, team.id, coach),
    null,
    "assignment removal takes effect immediately",
  );
});

test("missing, closed, and demo teams fail closed even for owners", () => {
  const { club, team } = fixture();
  assert.equal(staffTeamRosterView(null, team.id, owner), null);
  assert.equal(staffTeamRosterView(club, "unknown-team", owner), null);
  club._demo = true;
  assert.equal(staffTeamRosterView(club, team.id, owner), null);
  club._demo = false;
  team.closed = true;
  assert.equal(staffTeamRosterView(club, team.id, owner), null);
});

test("a misplaced player with another team ID never escapes through staff projection", () => {
  const { club, team } = fixture();
  const malformed = { ...team.roster[0], id: "misplaced-player", teamId: "another-team" };
  team.roster.push(malformed);
  assert(!staffTeamRosterView(club, team.id, owner)!.players.some((p) => p.id === malformed.id));
});

test("public consent and withdrawal protections remain independent of staff access", () => {
  const { club, team } = fixture();
  const player = team.roster[0];
  player.rosterConsent = {
    version: ROSTER_CONSENT_VERSION,
    text: ROSTER_CONSENT_TEXT,
    signedBy: "Synthetic guardian",
    signerEmail: "guardian@example.invalid",
    signedAt: "2026-10-01T00:00:00Z",
  };
  const publicIds = () =>
    publicTeamsView(club)
      .find((t) => t.id === team.id)!
      .players.map((p) => p.id);
  assert.deepEqual(publicIds(), [player.id]);
  player.rosterConsent.revokedAt = "2026-10-02T00:00:00Z";
  assert.deepEqual(publicIds(), []);
  assert(staffTeamRosterView(club, team.id, owner)!.players.some((p) => p.id === player.id));
  delete player.rosterConsent.revokedAt;
  player.withdrawn = true;
  assert.deepEqual(publicIds(), []);
  assert.equal(
    staffTeamRosterView(club, team.id, owner)!.players.find((p) => p.id === player.id)?.withdrawn,
    true,
  );
});
