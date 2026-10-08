import assert from "node:assert/strict";
import test from "node:test";
import { sampleClub } from "./seed";
import { scopeClub } from "./privacy";
test("family team staff view omits private employment fields", () => {
 const club=sampleClub();const team=club.teams.find(t=>t.staff.length&&t.roster.length)!;const p=team.roster[0];p.email="player@example.com";const s=team.staff[0];Object.assign(s,{childId:"private-child",w9:true,backgroundCheck:true,safeSport:true,expires:"private-expiry"});
 for(const role of ["parent","player"] as const){const view=scopeClub(club,role,{email:p.email,familyId:p.familyId,familyIds:[p.familyId]}).teams.find(t=>t.id===team.id)!.staff[0];assert.equal(view.childId,"");assert.equal(view.expires,"");assert.equal(view.w9,false);assert.equal(view.backgroundCheck,false);assert.equal(view.safeSport,false);assert.equal(view.name,s.name);}
 const coach=scopeClub(club,"coach",{email:team.coachEmail,familyId:""}).teams.find(t=>t.id===team.id)!.staff[0];assert.equal(coach.w9,true);assert.equal(scopeClub(club,"admin",{email:"",familyId:""}).teams.find(t=>t.id===team.id)!.staff[0].childId,"private-child");
});
