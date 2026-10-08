import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("unified tryout form gets published events from route loader and avoids season name guesswork",()=>{
 const route=readFileSync("src/routes/tryouts.tsx","utf8");
 const form=readFileSync("src/components/inquiry-form.tsx","utf8");
 assert.match(route,/publishedEvents=\{events\}/);
 assert.match(form,/publishedTryoutSeasons\(publishedEvents, values\.sport, values\.age\)/);
 assert.match(form,/Choose a published tryout season/);
 assert.match(form,/No group date is published for this sport and age/);
 assert.match(form,/age: nextAge, season: "", preferredTeamId/);
 assert.match(form,/autoEnroll: false,\s*season: "",\s*session:/);
});
