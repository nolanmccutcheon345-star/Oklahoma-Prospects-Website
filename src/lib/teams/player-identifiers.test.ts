import assert from "node:assert/strict";
import test from "node:test";
import {sampleClub} from "./seed";
import {parseClubSave} from "./contracts";
test("blank roster IDs are rejected while ordinary roster edits remain valid", () => {
 const full=sampleClub();const team=full.teams.find(t=>t.roster.length)!;
 for(const id of ["", "   "]) {const incoming=structuredClone(full);incoming.teams.find(t=>t.id===team.id)!.roster[0].id=id;assert.throws(()=>parseClubSave({club:incoming,baseRev:incoming._rev}),/Player identifiers/);}
 const incoming=structuredClone(full);incoming.teams.find(t=>t.id===team.id)!.roster[0].name="Updated player";assert.equal(parseClubSave({club:incoming,baseRev:incoming._rev}).club.teams.find(t=>t.id===team.id)!.roster[0].name,"Updated player");
});
