import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const legacyRoute = readFileSync("src/routes/visit.tsx", "utf8");
const configuration = readFileSync("netlify.toml", "utf8");
const smoke = readFileSync("scripts/check-hosted.mjs", "utf8");

test("legacy /visit routes to /visits on both client navigation and direct HTTP", () => {
  assert.match(legacyRoute, /createFileRoute\("\/visit"\)/);
  assert.match(legacyRoute, /redirect\(\{ to: "\/visits" \}\)/);
  assert.doesNotMatch(legacyRoute, /redirect\(\{ to: "\/more" \}\)/);
  assert.match(configuration, /from = "\/visit"\s+to = "\/visits"\s+status = 301/);
  assert.match(smoke, /"\/visit"/);
  assert.match(smoke, /new URL\("\/visits", origin\)/);
});
