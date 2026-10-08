import assert from "node:assert/strict";
import test from "node:test";
import {seedDevelopment} from "./seed";
import {scopeForViewer, filterDevelopmentData} from "./access";
import {mergeScopedFile} from "./file";
test("coach availability saves reject duplicate and another coach's identifiers", () => {
 const full=seedDevelopment();const coach=full.coaches.find(c=>c.active)!;const scope=scopeForViewer({role:"coach",email:coach.email,name:coach.name,playerName:""},full);
 full.availability=[{id:"other-slot",coachId:"another-coach",weekday:"Monday",window:"16:00-17:00"}];const before=structuredClone(full.availability);
 const row={id:"own-slot",coachId:coach.id,weekday:"Monday",window:"16:00-17:00"};
 for(const id of ["", "  ", "x".repeat(151), "other-slot"]) {
  const incoming=filterDevelopmentData(full,scope);incoming.availability=[{...row,id}];assert.throws(()=>mergeScopedFile(full,incoming,scope),/Availability identifiers/);assert.deepEqual(full.availability,before);
 }
 const incoming=filterDevelopmentData(full,scope);incoming.availability=[row,{...row}];assert.throws(()=>mergeScopedFile(full,incoming,scope),/Availability identifiers/);
 incoming.availability=[row];const saved=mergeScopedFile(full,incoming,scope);assert.deepEqual(saved.availability,[...before,row]);
 incoming.availability=[];assert.deepEqual(mergeScopedFile(full,incoming,scope).availability,before);
});
