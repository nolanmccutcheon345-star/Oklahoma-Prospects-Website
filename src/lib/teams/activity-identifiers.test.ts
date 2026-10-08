import assert from "node:assert/strict";
import test from "node:test";
import {sampleClub} from "./seed";
import {parseClubSave} from "./contracts";
test("team activity IDs cannot ambiguously select two practices, notes or pitch logs", () => {
 const full=sampleClub();const team=full.teams[0];
 const samples={practices:{id:"activity",date:"2026-10-08",time:"16:00",where:"Facility",cageHours:1,status:"set"},messages:{id:"activity",at:"2026-10-08",from:"Coach",body:"Note"},announcements:{id:"activity",title:"Note",body:"Body",pin:false,arrive:"",uniform:"",hotel:""},pitchLog:{id:"activity",playerId:team.roster[0].id,date:"2026-10-08",pitches:10}};
 for(const key of ['practices','messages','announcements','pitchLog'] as const) {
  for(const rows of [[samples[key],{...samples[key]}],[{...samples[key],id:"   "}],[{...samples[key],id:""}]]) {
   const incoming=structuredClone(full);(incoming.teams[0] as unknown as Record<string,unknown>)[key]=rows;assert.throws(()=>parseClubSave({club:incoming,baseRev:incoming._rev}),/Activity identifiers/);
  }
  const incoming=structuredClone(full);(incoming.teams[0] as unknown as Record<string,unknown>)[key]=[samples[key],{...samples[key],id:"another-activity"}];assert.equal(parseClubSave({club:incoming,baseRev:incoming._rev}).club.teams[0][key].length,2);
 }
});
