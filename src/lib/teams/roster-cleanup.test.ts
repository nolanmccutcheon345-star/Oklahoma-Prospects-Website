import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleClub } from "./seed";
import {
  duplicateRosterPlayer,
  assertNoNewRosterDuplicates,
  preserveRosterRemovals,
  assertSafeRosterMerge,
} from "./roster-cleanup";
import { scopeClub } from "./privacy";
import { operationalClubView } from "./operational-view";

const fixture = () => {
  const club = sampleClub();
  const team = club.teams[0];
  team.roster = team.roster.slice(0, 1);
  const player = team.roster[0];
  return { club, team, player };
};
test("same-team duplicate identity normalizes case, Unicode and spaces without conflating unrelated families", () => {
  const { team, player } = fixture();
  player.name = "  Alex   Smith ";
  player.parents[0].email = "Parent@Example.Invalid";
  assert.equal(
    duplicateRosterPlayer(team, "Ａlex Smith", " parent@example.invalid ")?.id,
    player.id,
  );
  assert.equal(duplicateRosterPlayer(team, "Alex Smith", "other@example.invalid"), undefined);
});
test("every new duplicate is rejected, even when an earlier match is withdrawn; old pairs remain reviewable", () => {
  const { club, team, player } = fixture();
  const before = structuredClone(club);
  team.roster.push({ ...structuredClone(player), id: "duplicate" });
  assert.throws(() => assertNoNewRosterDuplicates(before, club), /Duplicate/);
  assert.doesNotThrow(() => assertNoNewRosterDuplicates(club, structuredClone(club)));
  const retired = { ...structuredClone(player), id: "retired", withdrawn: true };
  team.roster.unshift(retired);
  assert.throws(() => assertNoNewRosterDuplicates(before, club), /Duplicate/);
});
test("removed record is persistent, audit is immutable, and financial history remains unchanged", () => {
  const { club, player } = fixture();
  player.withdrawn = true;
  player.rosterRemoval = {
    actorId: "owner",
    at: "2030-01-01",
    reason: "Duplicate enrollment",
    requestId: "request",
  };
  const before = structuredClone(player);
  const after = structuredClone(club);
  after.teams[0].roster[0].withdrawn = false;
  delete after.teams[0].roster[0].rosterRemoval;
  preserveRosterRemovals(club, after);
  assert.deepEqual(after.teams[0].roster[0], before);
  after.teams[0].roster = [];
  assert.throws(() => preserveRosterRemovals(club, after), /history must be retained/);
});
test("cleanup reason, actor and canonical aliases are owner-only in legacy and basis views", () => {
  const { club, team, player } = fixture();
  player.withdrawn = true;
  player.rosterRemoval = {
    actorId: "PRIVATE-ACTOR",
    at: "2030-01-01",
    reason: "PRIVATE-REASON",
    requestId: "PRIVATE-REQUEST",
    canonicalPlayerId: "PRIVATE-ALIAS",
  };
  for (const role of ["parent", "coach", "player"] as const) {
    const me = {
      email: role === "coach" ? team.coachEmail : player.parents[0].email,
      familyId: player.familyId,
      playerIds: [player.id],
    };
    for (const view of [scopeClub(club, role, me), operationalClubView(club, role, me)])
      assert.doesNotMatch(JSON.stringify(view), /PRIVATE-(ACTOR|REASON|REQUEST|ALIAS)/);
  }
  assert.equal(
    scopeClub(club, "admin", { email: "owner@example.invalid", familyId: "" }).teams[0].roster[0]
      .rosterRemoval?.reason,
    "PRIVATE-REASON",
  );
});
test("safe merge rejects distinct households and immutable or operational histories", () => {
  const { player } = fixture();
  const duplicate = structuredClone(player);
  duplicate.id = "duplicate";
  duplicate.withdrawn = false;
  player.withdrawn = false;
  duplicate.feeLock = null;
  duplicate.planLock = null;
  duplicate.agreement = { version: "", signedBy: "", signedAt: "" };
  duplicate.payments = [];
  duplicate.credits = [];
  duplicate.depositPaid = false;
  duplicate.cards = [];
  duplicate.stats = {};
  duplicate.rsvp = {};
  duplicate.docs = { waiver: false, birthCert: false, insurance: false, physical: false };
  duplicate.order.submitted = false;
  delete duplicate.rosterConsent;
  assert.doesNotThrow(() => assertSafeRosterMerge(player, duplicate));
  assert.throws(
    () => assertSafeRosterMerge(player, { ...duplicate, familyId: "other" }),
    /Identity conflict/,
  );
  assert.throws(
    () =>
      assertSafeRosterMerge(player, {
        ...duplicate,
        feeLock: { amount: 1, lockedAt: "now", policyVersion: "one", components: {} },
      }),
    /financial or contract/,
  );
  assert.throws(
    () => assertSafeRosterMerge(player, { ...duplicate, stats: { ab: 1 } }),
    /operational history/,
  );
});
test("confirmation submits frozen preview identities and invalidates reviews when selection or record changes", () => {
  const source = readFileSync(
    new URL("../../components/teams/roster-cleanup-controls.tsx", import.meta.url),
    "utf8",
  ).replace(/\s+/g, "");
  assert.match(source, /survivorId:merge.survivorId/);
  assert.match(source, /teamId:preview!\.teamId/);
  assert.match(source, /setSurvivorId\(e.target.value\);setMerge\(null\);setPreview\(null\)/);
  assert.match(source, /\[teamId,playerId\]/);
  assert.match(source, /token===generation.current/);
});
test("player-only family view cannot render guardian retained billing", () => {
  const source = readFileSync(
    new URL("../../components/teams/family-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const retained = !playerAccount && !financial/);
  assert.match(source, /\(player.payments\|\|\[\]\).map/);
});

test("bulk Save cannot recreate a removed identity under a fresh player ID", () => {
  const { club, team, player } = fixture();
  player.withdrawn = true;
  player.rosterRemoval = {
    actorId: "owner",
    at: "2030-01-01",
    reason: "Removed",
    requestId: "request",
  };
  const after = structuredClone(club);
  after.teams[0].roster.push({
    ...structuredClone(player),
    id: "fresh-id",
    withdrawn: false,
    rosterRemoval: undefined,
  });
  assert.throws(() => assertNoNewRosterDuplicates(club, after), /removed matching roster identity/);
  assert.equal(team.roster.length, 1);
});


test("duplicate admission prefers the active survivor before falling back to retained history", () => {
  const {team, player} = fixture();
  player.withdrawn = false;
  delete player.rosterRemoval;
  const removed = {...structuredClone(player), id:"removed-duplicate", withdrawn:true,
    rosterRemoval:{actorId:"owner",at:"2030-01-01",reason:"Duplicate",requestId:"synthetic",canonicalPlayerId:player.id}};
  const inconsistentTombstone = {...structuredClone(removed),id:"tombstone",withdrawn:false};
  team.roster = [removed, inconsistentTombstone, player];
  const email = player.parents[0].email;
  assert.equal(duplicateRosterPlayer(team,player.name,email)?.id,player.id,"existing-record selection must use the active survivor");
  assert.equal(duplicateRosterPlayer(team,player.name,email,player.id)?.id,removed.id,"retained record remains discoverable when no active match exists");
  team.roster = [removed];
  assert.equal(duplicateRosterPlayer(team,player.name,email)?.id,removed.id);
});
