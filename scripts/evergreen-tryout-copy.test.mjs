import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("team discovery and site metadata never claim an unverified fixed season", () => {
 const page=readFileSync("src/routes/teams.tsx","utf8");
 const root=readFileSync("src/routes/__root.tsx","utf8");
 assert.doesNotMatch(page, /Spring 2027|Spring 2026|Free Spring tryout/i);
 assert.doesNotMatch(root, /Spring 2027|Spring 2026|Free Spring tryout/i);
 assert.match(page, /getPublicTryoutEvents\(\)/);
 assert.match(page, /TryoutSchedule events=\{events\}/);
 assert.match(root, /baseball and softball tryout requests/);
});
