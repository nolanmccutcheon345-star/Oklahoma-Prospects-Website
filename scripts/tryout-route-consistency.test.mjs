import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("homepage and teams route consume the published tryout source, never a fixed legacy date", async () => {
  const home = await readFile("src/routes/index.tsx", "utf8");
  const teams = await readFile("src/routes/teams.tsx", "utf8");
  const tryouts = await readFile("src/routes/tryouts.tsx", "utf8");
  for (const [page, content] of [["teams", teams], ["tryouts", tryouts]]) {
    assert.match(content, /loader:\s*\(\) => getPublicTryoutEvents\(\)/, page + " missing canonical schedule loader");
  }
  assert.doesNotMatch(home, /Nov\s*14|Nov\s*15|2026-11-14|2026-11-15/);
  assert.equal((home.match(/to="\/tryouts"/g) || []).length, 1);
  assert.match(home, />Tryouts</);
  assert.doesNotMatch(home, /Free · request a tryout|Earn a roster spot/);
  assert.doesNotMatch(home, /getPublicTryoutEvents\(\)/);
  assert.match(teams.slice(teams.indexOf("function TeamsPublic()")), /const events = Route\.useLoaderData\(\)/);
  assert.match(teams, /TryoutSchedule events=\{events\} sport="Baseball"/);
  assert.match(teams, /TryoutSchedule events=\{events\} sport="Softball"/);
  assert.match(teams, /hasSoftballDates\s*\?/);
  assert.match(teams, /hasBaseballDates\s*\?/);
  assert.doesNotMatch(teams, /<TryoutSchedule\s*\/>/);
});
