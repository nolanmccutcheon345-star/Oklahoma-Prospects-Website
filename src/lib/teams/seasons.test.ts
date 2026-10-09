import test from "node:test";
import assert from "node:assert/strict";
import { canonicalTeamSeasons, selectedTeamSeasons, teamSeasonOptions } from "./seasons";
test("Single season switches correctly from Spring to Summer 2027", () => {
 assert.equal(canonicalTeamSeasons(["Summer 2027"]), "Summer 2027");
 assert.deepEqual(selectedTeamSeasons("Spring 2027"), ["Spring 2027"]);
 assert.deepEqual(selectedTeamSeasons("Summer 2027"), ["Summer 2027"]);
});
test("Multiple seasons survive edit/save/read round trips without duplication", () => {
 for (const selection of [
  ["Spring 2027", "Summer 2027"],
  ["Fall 2026", "Spring 2027", "Summer 2027"],
  ["Summer 2027", "Winter 2028", "Fall 2027"],
 ]) {
   const formatted=canonicalTeamSeasons(selection);
   assert.deepEqual(selectedTeamSeasons(formatted).sort(), [...selection].sort());
 }
 assert.equal(canonicalTeamSeasons(["Summer 2027", "Spring 2027", "Spring 2027"]), "Spring & Summer 2027");
 assert.equal(canonicalTeamSeasons(["Fall 2026", "Spring 2027"]), "Fall 2026 / Spring 2027");
 assert.deepEqual(selectedTeamSeasons("Spring & Summer 2027"), ["Spring 2027", "Summer 2027"]);
});
test("Invalid, missing and malformed seasons are rejected without changing club data", () => {
 for(const inputs of [[], ["Spring 2027","Halloween 2027"], ["2027"], ["Spring 1999"]])
   assert.throws(()=>canonicalTeamSeasons(inputs),/valid season/);
 assert.deepEqual(selectedTeamSeasons("Custom 2027"), []);
 assert.ok(teamSeasonOptions().includes("Fall 2027"));
});
