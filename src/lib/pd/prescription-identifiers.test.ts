import assert from "node:assert/strict";
import test from "node:test";
import { seedDevelopment } from "./seed";
import { scopeForViewer } from "./access";
import { mergeScopedFile } from "./file";
import { THROWING_PLANS } from "./content/throwing";
test("duplicate new prescription IDs cannot create ambiguous history", () => {
 const full=seedDevelopment();const scope=scopeForViewer({role:"admin",email:"admin@example.com",name:"Admin",playerName:""},full);
 const plan=THROWING_PLANS[0];const row={id:"new-version",athleteId:"a-down",templateId:plan.id,dayType:plan.days[0].type};
 const incoming=structuredClone(full);incoming.throwingAssignments=[row,{...row,athleteId:"a-full"}];
 assert.throws(()=>mergeScopedFile(full,incoming,scope),/Prescription version identifiers/);
 incoming.throwingAssignments=[row];const saved=mergeScopedFile(full,incoming,scope);assert.equal(saved.throwingAssignments[0].id,row.id);
 const changed=structuredClone(saved);changed.throwingAssignments[0].dayType="forged";assert.equal(mergeScopedFile(saved,changed,scope).throwingAssignments[0].dayType,row.dayType);
});
