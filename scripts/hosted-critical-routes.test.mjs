import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("release smoke requires Teams, Tryouts and native Games routes", () => {
  const code = readFileSync("scripts/check-hosted.mjs", "utf8");
  for (const route of ["/teams", "/tryouts", "/games"])
    assert.ok(code.includes(`["${route}", 200]`), `Hosted smoke must cover ${route}`);
  assert.match(code, /privateCache\(response\)/);
  assert.match(code, /assert\.match\(html, \/<main/);
  assert.doesNotMatch(code, /method: "POST"/);
});

test("Games stays on the main site and is not a redirect to the separate legacy application", () => {
  const page = readFileSync("src/routes/games.tsx", "utf8");
  const nav = readFileSync("src/components/app-shell.tsx", "utf8");
  assert.match(page, /createFileRoute\("\/games"\)/);
  assert.match(page, /PageHero/);
  assert.doesNotMatch(page, /chatgpt\.site|location\.href|window\.open|iframe|throw redirect/);
  assert.match(nav, /to: "\/games"/);
});
