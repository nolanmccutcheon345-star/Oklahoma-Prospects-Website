import assert from "node:assert/strict";
import test from "node:test";
import { sampleClub } from "./seed";
import { coachHoldsTeam, scopeClub, mergeSave } from "./privacy";
test("blank coach identity cannot match unassigned team", () => {
 const club=sampleClub(); for(const t of club.teams){t.coachEmail="";for(const s of t.staff)s.email="";}
 const identity={email:" ",familyId:""};const incoming=structuredClone(club);incoming.teams[0].notes="forged";
 assert.equal(coachHoldsTeam(club,identity.email,club.teams[0].id),false);
 assert.equal(scopeClub(club,"coach",identity).teams.length,0);
 assert.equal(mergeSave(club,incoming,"coach",identity).teams[0].notes,club.teams[0].notes);
});
test("coach scope and save normalize the same identity", () => {
 const club=sampleClub();club.teams[0].coachEmail=" Coach@Example.COM ";const identity={email:" coach@example.com ",familyId:""};
 assert.ok(scopeClub(club,"coach",identity).teams.some(t=>t.id===club.teams[0].id));
 const incoming=structuredClone(club);incoming.teams[0].notes="authorized";
 assert.equal(mergeSave(club,incoming,"coach",identity).teams[0].notes,"authorized");
});
