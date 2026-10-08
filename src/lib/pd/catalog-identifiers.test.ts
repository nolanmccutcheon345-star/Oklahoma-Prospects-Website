import assert from "node:assert/strict";
import test from "node:test";
import {seedDevelopment} from "./seed";
import {scopeForViewer} from "./access";
import {mergeScopedFile} from "./file";
test("office catalog saves reject ambiguous identifiers and preserve valid edits", () => {
 const full=seedDevelopment();const before=structuredClone(full);const scope=scopeForViewer({role:"admin",email:"owner@example.com",name:"Owner",playerName:""},full);
 for(const key of ["services","packages","memberships","availability","benchmarks","videoStandards","coaches"] as const) {
  const source=full[key][0];assert.ok(source);
  for(const id of ["", "  ", "x".repeat(151)]) {
   const incoming=structuredClone(full);(incoming as unknown as Record<string,unknown>)[key]=[{...source,id}];assert.throws(()=>mergeScopedFile(full,incoming,scope),/Catalog identifiers/);
  }
  const incoming=structuredClone(full);(incoming as unknown as Record<string,unknown>)[key]=[source,{...source}];assert.throws(()=>mergeScopedFile(full,incoming,scope),/Catalog identifiers/);
 }
 assert.deepEqual(full,before);const incoming=structuredClone(full);incoming.services[0].name="Updated service";assert.equal(mergeScopedFile(full,incoming,scope).services[0].name,"Updated service");
});
