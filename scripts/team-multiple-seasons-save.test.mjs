import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("front office saves multiple seasons for one team through owner-only server action", () => {
 const source = readFileSync("src/components/teams/office-app.tsx", "utf8");
 const backend = readFileSync("src/lib/teams/store.ts", "utf8");
 assert.match(source, /type="checkbox" checked=\{values\.includes\(option\)\}/);
 assert.match(source, /officeSetTeamSeasons\(\{ data: \{ teamId: team\.id, baseRev: revision, seasons: selected \} \}\)/);
 assert.match(source, /season: canonicalTeamSeasons\(seasonSelections\)/);
 assert.doesNotMatch(source, /onClick=\{\(\)=>\{void onSave\(\);\}\}>Save season/);
 assert.match(backend, /me\.role !== "admin"/);
 assert.match(backend, /canonicalTeamSeasons\(data\.seasons\)/);
 assert.match(backend, /team\.seasonLabel = label/);
 assert.match(backend, /writeRaw\(stored, data\.baseRev\)/);
 assert.match(source, /Season labels do not change scheduled events or team billing dates/);
});
