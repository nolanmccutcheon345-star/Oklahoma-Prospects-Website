import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("all coach biographies are collapsed and team assignments remain immediately visible", () => {
 const page = readFileSync("src/routes/coaches.tsx", "utf8");
 assert.match(page, /<details\s+className=/);
 assert.match(page, /<summary\s+className=[^>]+>Bio<\/summary>/);
 assert.doesNotMatch(page, /<details[^>]*\bopen\b/);
 assert.match(page, /<TeamsCoached teams=\{assigned\}/);
 assert.match(page, /<TeamsCoached teams=\{person\.teams\}/);
 assert.match(page, /getPublicTeamCoaches\(\)/);
 assert.match(page, /visibleLessonCoaches/);
 assert.match(page, /const shownNames = new Set/);
});
