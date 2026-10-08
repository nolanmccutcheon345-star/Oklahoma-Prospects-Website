import assert from "node:assert/strict";
import test from "node:test";
import { sampleClub } from "./seed";
import { parseClubSave } from "./contracts";
test("team saves reject ambiguous team and staff IDs", () => {
 const club=sampleClub();const input={club,baseRev:club._rev};assert.doesNotThrow(()=>parseClubSave(input));
 club.teams[1].id=club.teams[0].id;assert.throws(()=>parseClubSave(input),/Team identifiers/);
 club.teams[1].id="";assert.throws(()=>parseClubSave(input),/Team identifiers/);
 const clean=sampleClub();const team=clean.teams.find(t=>t.staff.length)!;team.staff.push({...team.staff[0]});assert.throws(()=>parseClubSave({club:clean,baseRev:clean._rev}),/Staff identifiers/);
});
test("a staff identity can legitimately serve different teams", () => {
 const club=sampleClub();const staff=club.teams.find(t=>t.staff.length)!.staff[0];for(const team of club.teams)team.staff=[structuredClone(staff)];assert.doesNotThrow(()=>parseClubSave({club,baseRev:club._rev}));
});
