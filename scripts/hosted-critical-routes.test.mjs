import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("release smoke requires both public team and tryout customer routes", () => {
  const code = readFileSync("scripts/check-hosted.mjs", "utf8");
  for (const route of ["/teams", "/tryouts"])
    assert.ok(code.includes(`["${route}", 200]`), `Hosted smoke must cover ${route}`);
  assert.match(code, /privateCache\(response\)/);
  assert.match(code, /assert\.match\(html, \/<main/);
  assert.doesNotMatch(code, /method: "POST"/);
});
