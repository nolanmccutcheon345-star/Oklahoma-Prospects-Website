import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("owner's front office must display preferred team/coach and require a conscious override", () => {
  const view = readFileSync("src/components/commerce/office-requests.tsx", "utf8");
  assert.match(view, /Family preference:/);
  assert.match(view, /preferredCoachId/);
  assert.match(view, /const differentTeam =/);
  assert.match(view, /differentTeam && !acknowledge/);
  assert.match(view, /getPublicTryoutTeams\(\)/);
  assert.match(view, /!team\.closed\s*&&\s*validDate\(team\.seasonEnd\)/);
});

test("owner's POST revalidates sport age team season and override independently of browser", () => {
  const server = readFileSync("src/lib/teams/store.ts", "utf8");
  assert.match(server, /assertTeamInquiryPlacement\(request\.payload,team,data\.acknowledgePreferenceOverride\)/);
  assert.match(server, /acknowledgePreferenceOverride:z\.boolean\(\)\.default\(false\)/);
  assert.match(server, /me\.role!==\x27admin\x27/);
});
