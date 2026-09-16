import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClubSave} from './contracts';
import {sampleClub} from './seed';
import {scopeClub} from './privacy';
import {validateRecord} from '../record-validation';
test('club saves accept actual role shapes and reject malformed or cross-roster records',()=>{
 const club=sampleClub();parseClubSave({club,baseRev:club._rev});
 const team=club.teams[0];
 if(team){const scoped=scopeClub(club,'coach',{email:team.coachEmail,familyId:''});parseClubSave({club:scoped,baseRev:club._rev});}
 assert.throws(()=>parseClubSave({club:{...club,settings:{...club.settings,facilityMonthly:-1}},baseRev:club._rev}));
 assert.throws(()=>parseClubSave({club:{...club,_rev:NaN},baseRev:club._rev}));
 if(team?.roster[0]){const copy=structuredClone(club);copy.teams[0].roster[0].teamId='another-team';assert.throws(()=>parseClubSave({club:copy,baseRev:club._rev}),/does not match/);}
 assert.throws(()=>validateRecord({text:'x'.repeat(20001)}));
 assert.throws(()=>validateRecord({amount:Infinity}));
 assert.throws(()=>validateRecord(JSON.parse('{"__proto__":{"admin":true}}')));
});
