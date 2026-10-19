import assert from "node:assert/strict";
import test from "node:test";
import type { EventItem, Team } from "./types";
import { sampleClub } from "./seed";
import { parseClubSave } from "./contracts";
import { mergeSave, scopeClub } from "./privacy";
import {
  defaultTournamentFilters,
  filterTournaments,
  parseTournamentRecord,
  safeTournamentUrl,
  tournamentConflict,
  tournamentMatchesTeam,
  tournamentRange,
  validTournamentDate,
} from "./tournament-finder";

const event: EventItem = {
  id: "fixture-event",
  name: "Synthetic Spring Tournament",
  org: "Fixture Organizer",
  city: "Broken Arrow",
  state: "OK",
  sport: "baseball",
  ages: ["13U", "14U"],
  levels: ["AAA", "Open"],
  start: "2027-03-20",
  end: "2027-03-22",
  fee: 500,
  type: "tournament",
  stayToPlay: false,
  verifiedOn: "2026-09-01",
};
const team = {
  id: "fixture-team",
  sport: "baseball",
  age: "13U",
  level: "AAA",
  seasonStart: "2027-03-01",
  seasonEnd: "2027-07-01",
  tournamentIds: [],
} as unknown as Team;
const all = () => ({ ...defaultTournamentFilters(), range: "all" as const });

test("finder filters sport, age, state, division, name/city/organizer, type and lodging", () => {
  for (const partial of [
    { sport: "softball" },
    { age: "18U" },
    { state: "TX" },
    { division: "AA" },
    { query: "does not exist" },
    { type: "showcase" },
  ]) {
    assert.deepEqual(filterTournaments([event], { ...all(), ...partial }), []);
  }
  for (const query of ["spring", " BROKEN ARROW ", "organizer", "OK"])
    assert.equal(filterTournaments([event], { ...all(), query }).length, 1);
  assert.equal(
    filterTournaments([event], {
      ...all(),
      sport: "baseball",
      age: "14U",
      state: "OK",
      division: "Open",
    }).length,
    1,
  );
  assert.equal(
    filterTournaments([{ ...event, stayToPlay: true }], { ...all(), noStayToPlay: true }).length,
    0,
  );
  assert.equal(filterTournaments([{ ...event, org: "Team schedule" }], all()).length, 0);
});

test("date filtering is inclusive and includes events spanning the requested window", () => {
  const filters = { ...all(), range: "custom" as const, from: "2027-03-22", to: "2027-03-22" };
  assert.equal(filterTournaments([event], filters).length, 1);
  assert.equal(
    filterTournaments([event], { ...filters, from: "2027-03-23", to: "2027-04-01" }).length,
    0,
  );
  assert.equal(filterTournaments([event], { ...filters, from: "2027-04-01" }).length, 0);
  assert.deepEqual(tournamentRange({ ...all(), range: "30" }, undefined, "2027-01-01"), {
    from: "2027-01-01",
    to: "2027-01-30",
  });
  assert.equal(filterTournaments([event], defaultTournamentFilters(team), team).length, 1);
  assert.equal(filterTournaments([{ ...event, start: "garbage" }], filters).length, 0);
  assert.equal(validTournamentDate("2027-02-29"), false);
  assert.equal(validTournamentDate("2028-02-29"), true);
});

test("cost and distance limits treat zero as a value and never assume missing distance is zero", () => {
  const records = [
    event,
    { ...event, id: "local", fee: 0, distanceMiles: 0 },
    { ...event, id: "far", fee: 200, distanceMiles: 201 },
  ];
  assert.deepEqual(
    filterTournaments(records, { ...all(), maxFee: "0" }).map((e) => e.id),
    ["local"],
  );
  assert.deepEqual(
    filterTournaments(records, { ...all(), maxDistance: "200" }).map((e) => e.id),
    ["local"],
  );
  assert.deepEqual(
    filterTournaments(records, { ...all(), sort: "distance" }).map((e) => e.id),
    ["local", "far", "fixture-event"],
  );
  assert.deepEqual(
    filterTournaments(records, { ...all(), sort: "fee" }).map((e) => e.id),
    ["local", "far", "fixture-event"],
  );
});

test("planned filtering and conflict warnings use only the selected team's saved selections", () => {
  const plannedTeam = { ...team, tournamentIds: [event.id] };
  assert.equal(filterTournaments([event], { ...all(), plannedOnly: true }, plannedTeam).length, 1);
  assert.equal(filterTournaments([event], { ...all(), plannedOnly: true }, team).length, 0);
  assert.equal(tournamentMatchesTeam(event, team), true);
  assert.equal(tournamentMatchesTeam({ ...event, ages: ["18U"] }, team), false);
  assert.equal(
    tournamentConflict({ ...event, id: "other", start: "2027-03-22" }, plannedTeam, [event])?.id,
    event.id,
  );
  assert.equal(
    tournamentConflict(
      { ...event, id: "other", start: "2027-03-23", end: "2027-03-23" },
      plannedTeam,
      [event],
    ),
    undefined,
  );
});

test("manual records validate dates, costs, and safe source provenance without claiming verification", () => {
  const real = parseTournamentRecord({
    ...event,
    verifiedOn: "",
    sourceUrl: "https://example.invalid/event",
    sourceCheckedOn: "2026-10-01",
    distanceMiles: 45,
  });
  assert.equal(real.verifiedOn, "");
  assert.equal(real.sourceCheckedOn, "2026-10-01");
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.invalid",
    "https://name:secret@example.invalid",
    "not a URL",
  ])
    assert.equal(safeTournamentUrl(sourceUrl), null);
  for (const fields of [
    { end: "2027-01-01" },
    { start: "2027-02-30" },
    { fee: -1 },
    { distanceMiles: -1 },
    { sourceUrl: "javascript:alert(1)" },
    { sourceCheckedOn: "2099-01-01" },
    { sourceCheckedOn: "2026-10-01", sourceUrl: "" },
  ])
    assert.throws(() => parseTournamentRecord({ ...event, ...fields }));
});

test("existing save contract preserves optional source metadata without expanding coach scope", () => {
  const club = sampleClub();
  club.catalog = [
    {
      ...event,
      sourceUrl: "https://example.invalid/event",
      sourceCheckedOn: "2026-10-01",
      distanceMiles: 45,
    },
  ];
  club.teams[0].coachEmail = "finder-coach@example.invalid";
  for (const other of club.teams.slice(1)) {
    other.coachEmail = "other@example.invalid";
    other.staff = [];
  }
  const identity = { email: "finder-coach@example.invalid", familyId: "" };
  const scoped = scopeClub(club, "coach", identity);
  assert.equal(scoped.teams.length, 1);
  const incoming = structuredClone(scoped);
  incoming.teams[0].tournamentIds = [event.id];
  incoming.catalog[0].fee = 1;
  incoming.catalog[0].sourceUrl = "https://changed.example.invalid";
  const parsed = parseClubSave({ club: incoming, baseRev: club._rev });
  const merged = mergeSave(club, parsed.club, "coach", identity);
  assert.deepEqual(merged.teams[0].tournamentIds, [event.id]);
  assert.deepEqual(merged.teams[1], club.teams[1]);
  assert.deepEqual(merged.catalog, club.catalog);
  assert.deepEqual(merged.notifications, club.notifications);
  assert.equal(merged.catalog[0].distanceMiles, 45);
  assert.equal(
    parseClubSave({ club, baseRev: club._rev }).club.catalog[0].sourceCheckedOn,
    "2026-10-01",
  );
});

test("scheduled catalog details remain locked server-side, including closed teams and same-save removal", () => {
  const club = sampleClub();
  club.catalog = [event];
  club.teams[0].tournamentIds = [event.id];
  club.teams[0].closed = true;
  const identity = { email: "owner@example.invalid", familyId: "" };
  const metadataOnly = structuredClone(club);
  metadataOnly.catalog[0].sourceUrl = "https://example.invalid/event";
  metadataOnly.catalog[0].distanceMiles = 0;
  assert.equal(mergeSave(club, metadataOnly, "admin", identity).catalog[0].distanceMiles, 0);
  for (const changes of [
    { fee: 10 },
    { start: "2027-03-19" },
    { ages: ["18U"] },
    { id: "replacement" },
  ]) {
    const incoming = structuredClone(club);
    incoming.catalog[0] = { ...incoming.catalog[0], ...changes };
    incoming.teams[0].tournamentIds = [];
    assert.throws(() => mergeSave(club, incoming, "admin", identity), /details are locked/);
  }
  assert.throws(
    () => mergeSave(club, { ...club, catalog: [] }, "admin", identity),
    /details are locked/,
  );
  const unscheduled = structuredClone(club);
  unscheduled.teams[0].tournamentIds = [];
  const changed = structuredClone(unscheduled);
  changed.catalog[0].fee = 20;
  assert.equal(mergeSave(unscheduled, changed, "admin", identity).catalog[0].fee, 20);
  assert.throws(() => parseTournamentRecord({ ...event, org: "Team schedule" }), /reserved/);
  assert.throws(
    () =>
      parseClubSave({
        club: { ...club, catalog: [{ ...event, sourceCheckedOn: "2026-10-01" }] },
        baseRev: club._rev,
      }),
    /organizer link/,
  );
});
