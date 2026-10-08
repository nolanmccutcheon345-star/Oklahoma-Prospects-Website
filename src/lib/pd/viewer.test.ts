import assert from "node:assert/strict";
import test from "node:test";
import { publicPdViewer } from "./viewer";
test("player viewer projection omits guardian emails and internal identity grants", () => {
 const identity={role:"player" as const,email:"player@example.com",name:"Player",playerName:"Player",householdEmails:["guardian@example.com"],userId:"private-user",familyIds:["private-family"],billingHouseholdIds:["private-billing"],owner:true};
 assert.deepEqual(publicPdViewer(identity),{role:"player",email:identity.email,name:"Player",playerName:"Player"});
});
test("guardian viewer retains lookup emails through an explicit projection", () => {
 const identity={role:"parent" as const,email:"guardian@example.com",name:"Guardian",playerName:"",householdEmails:["guardian@example.com"],familyIds:["private-family"]};const projected=publicPdViewer(identity);
 assert.deepEqual(projected.householdEmails,identity.householdEmails);assert.notEqual(projected.householdEmails,identity.householdEmails);assert.equal("familyIds" in projected,false);
});
