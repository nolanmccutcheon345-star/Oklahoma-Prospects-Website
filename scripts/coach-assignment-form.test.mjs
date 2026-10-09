import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("new coach profile and additional coach selection save only on explicit action",()=>{
 const page=readFileSync("src/components/teams/office-app.tsx","utf8");
 assert.match(page,/selectedNewCoach\[team\.id\] \?\? ""/);
 assert.match(page,/>Add coach<\/Button>/);
 assert.match(page,/coaches\.filter\(c => !isAssignedCoach\(team, c\.email\)\)/);
 assert.match(page,/role === "Head coach"/);
 assert.match(page,/assignedAssistantCoaches\(team\)/);
 assert.match(page,/if \(saved\) \{ setName\(""\); setEmail\(""\); \}/);
 assert.doesNotMatch(page,/value="" onChange=\{e => \{\s*const coach = coaches\.find/);
});
test("coach bio/photo editor initially remains collapsed",()=>{
 const page=readFileSync("src/components/teams/team-coach-profile-editor.tsx","utf8");
 assert.match(page,/<details className=/);
 assert.match(page,/<summary className=/);
 assert.doesNotMatch(page,/<details[^>]+open=/);
});
