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
  // t136u: the review body moved to the shared Front Office assignment core.
  const core = readFileSync("src/lib/teams/roster-assignment.server.ts", "utf8");
  assert.match(server, /return reviewTeamInquiryForOffice\(await getSql\(\),context\.userId,data\)/);
  assert.match(core, /assertTeamInquiryPlacement\(request\.payload,\s*team,\s*data\.acknowledgePreferenceOverride\)/);
  assert.match(core, /const data = inquiryRosterInput\.parse\(raw\)/);
  assert.match(server, /\.validator\(inquiryRosterInput\)/);
  assert.match(server, /me\.role!==\x27admin\x27/);
});
