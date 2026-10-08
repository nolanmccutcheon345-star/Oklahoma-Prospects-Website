import test from "node:test";
import assert from "node:assert/strict";
import {newCoachId} from "./coach-id.server";
test("new coach IDs separate punctuation and shared-prefix email collisions",()=>{
 const emails=["same.long.coach.name+one@example.invalid","same.long.coach.name+two@example.invalid","a.b@example.invalid","ab@example.invalid"];
 assert.equal(new Set(emails.map(newCoachId)).size,emails.length);
 assert.equal(newCoachId(" Coach@Example.invalid "),newCoachId("coach@example.invalid"));
 assert.throws(()=>newCoachId(" "),/email is required/);
});
