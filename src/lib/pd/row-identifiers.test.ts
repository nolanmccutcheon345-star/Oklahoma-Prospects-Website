import assert from "node:assert/strict";
import test from "node:test";
import { seedDevelopment } from "./seed";
import { scopeForViewer, filterDevelopmentData } from "./access";
import { mergeScopedFile } from "./file";
test("scoped saves reject another athlete's row identifier", () => {
 const full=seedDevelopment();const scope=scopeForViewer({role:"parent",email:"marisol.navarro@example.com",name:"Parent",playerName:""},full);
 full.goals=[{id:"other-goal",athleteId:"a-full",title:"private",target:"",status:"open"}];
 const incoming=filterDevelopmentData(full,scope);incoming.goals=[{...full.goals[0],athleteId:"a-down"}];
 assert.throws(()=>mergeScopedFile(full,incoming,scope),/belongs to another athlete/);assert.equal(full.goals[0].athleteId,"a-full");
});
test("duplicate writable rows are rejected while distinct records are saved", () => {
 const full=seedDevelopment();const scope=scopeForViewer({role:"admin",email:"admin@example.com",name:"Admin",playerName:""},full);const incoming=structuredClone(full);
 incoming.goals=[{id:"new-goal",athleteId:"a-down",title:"goal",target:"",status:"open"}];incoming.goals.push({...incoming.goals[0]});
 assert.throws(()=>mergeScopedFile(full,incoming,scope),/unique/);incoming.goals.pop();assert.equal(mergeScopedFile(full,incoming,scope).goals.length,1);
});
