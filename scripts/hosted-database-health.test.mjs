import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("exact-source production smoke covers the read-only database health response", () => {
 const smoke=readFileSync("scripts/check-hosted.mjs","utf8");
 assert.match(smoke, /request\("\/api\/health"\)/);
 assert.match(smoke, /healthResponse\.status === 200/);
 assert.match(smoke, /\[200, 503\]\.includes\(healthResponse\.status\)/);
 assert.match(smoke, /Object\.keys\(health\)\.sort\(\)/);
 assert.match(smoke, /databaseFingerprint, null/);
 assert.doesNotMatch(smoke, /method: "POST"/);
});
