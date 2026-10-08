import assert from "node:assert/strict";
import test from "node:test";
import { seedState } from "./engine/04-seed.js";
import { clubExports } from "./ops.ts";

test("CSV exports neutralize spreadsheet formulas in untrusted cells", () => {
  const club = seedState();
  const team = club.teams.find((t) => t.roster.length);
  const athlete = team.roster[0];
  athlete.name = '=HYPERLINK("https://example.invalid","Open")';
  athlete.emergency.allergies = "\t=IMPORTRANGE(\"private\",\"A1\")";
  athlete.parents[0].name = "@SUM(1,2)";
  club.audit = [{ actor: "owner", action: "note", detail: "\r+HYPERLINK(\"https://example.invalid\",\"x\")" }];
  club.payouts = [{ id: "refund-1", teamId: team.id, staffId: "staff", amount: -125, date: "2026-10-08", kind: "adjustment" }];

  const outputs = new Map(clubExports(club).map((f) => [f.id, f.body]));
  const players = outputs.get("players");
  const emergency = outputs.get("emergency");
  const audit = outputs.get("audit");
  const payouts = outputs.get("payouts");

  assert.ok(players.includes('\u0022\u0027=HYPERLINK(\u0022\u0022https://example.invalid\u0022\u0022,\u0022\u0022Open\u0022\u0022)\u0022'));
  assert.ok(emergency.includes('\u0022\u0027\t=IMPORTRANGE(\u0022\u0022private\u0022\u0022,\u0022\u0022A1\u0022\u0022)\u0022'));
  assert.ok(emergency.includes('\u0022\u0027@SUM(1,2)\u0022'));
  assert.ok(audit.includes('\u0022\u0027\r+HYPERLINK('));
  // Keep signed, real numeric amounts machine-readable rather than escaping them.
  assert.ok(payouts.includes(",staff,-125,2026-10-08"));
});

test("CSV exports guard BOM and leading whitespace formula prefixes", () => {
  const club = seedState();
  const team = club.teams.find((t) => t.roster.length);
  const athlete = team.roster[0];
  athlete.name = "\uFEFF=SUM(1,2)";
  const players = clubExports(club).find((file) => file.id === "players").body;
  assert.ok(players.includes("'\uFEFF=SUM(1,2)"));
  athlete.name = "  +SUM(1,2)";
  const spaced = clubExports(club).find((file) => file.id === "players").body;
  assert.ok(spaced.includes("'  +SUM(1,2)"));
});
