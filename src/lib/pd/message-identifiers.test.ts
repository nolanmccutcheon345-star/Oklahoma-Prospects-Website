import assert from "node:assert/strict";
import test from "node:test";
import { seedDevelopment } from "./seed";
import { scopeForViewer, filterDevelopmentData } from "./access";
import { mergeScopedFile } from "./file";
test("duplicate new messages are rejected without rewriting message history", () => {
 const full=seedDevelopment();const scope=scopeForViewer({role:"parent",email:"marisol.navarro@example.com",name:"Parent",playerName:""},full);const incoming=filterDevelopmentData(full,scope);
 const row={id:"new-message",athleteId:"a-down",fromName:"Parent",fromRole:"parent" as const,body:"New note",createdAt:"2026-10-07",channel:"family" as const};incoming.messages=[row,{...row}];
 assert.throws(()=>mergeScopedFile(full,incoming,scope),/message identifiers/);incoming.messages=[row];const saved=mergeScopedFile(full,incoming,scope);assert.equal(saved.messages.filter(m=>m.id===row.id).length,1);assert.deepEqual(saved.messages.slice(0,full.messages.length),full.messages);
});
