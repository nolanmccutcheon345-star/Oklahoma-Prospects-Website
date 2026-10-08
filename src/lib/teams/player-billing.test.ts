import assert from "node:assert/strict";
import test from "node:test";
import { sampleClub } from "./seed";
import { scopeClub } from "./privacy";
test("player roster omits billing status while parent retains own charges", () => {
 const club=sampleClub();const p=club.teams[0].roster[0];p.email="player@example.com";p.planType="installments";p.depositPaid=true;p.uniformWaived=true;p.cageOverage=75;
 const player=scopeClub(club,"player",{email:p.email,familyId:p.familyId}).teams[0].roster[0];
 assert.equal(player.planType,"");assert.equal(player.depositPaid,false);assert.equal(player.uniformWaived,false);assert.equal(player.cageOverage,0);assert.equal(player.payments,undefined);assert.deepEqual(player.stats,p.stats);
 const parent=scopeClub(club,"parent",{email:"guardian@example.com",familyId:p.familyId,familyIds:[p.familyId]}).teams[0].roster[0];
 assert.equal(parent.planType,"installments");assert.equal(parent.cageOverage,75);assert.equal(scopeClub(club,"admin",{email:"",familyId:""}),club);
});
