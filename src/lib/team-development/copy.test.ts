import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const familyFiles=[
  new URL("../../components/team-development/family-panel.tsx",import.meta.url),
  new URL("../../components/team-development/athlete-panel.tsx",import.meta.url),
  new URL("./copy.ts",import.meta.url),
];
const banned=[
  /individualized plan/i,
  /guarantee(?:d|s)? results?/i,
  /increase(?:s|d)? velocity/i,
  /injury prevention/i,
  /prevent(?:s|ed|ing)? injury/i,
  /treat(?:s|ed|ing)? injur/i,
  /pitch smart approved/i,
  /asmi approved/i,
  /aap approved/i,
  /nsca approved/i,
  /scheduled reassessment/i,
];
test("Team Development family copy contains no banned claims",async()=>{
  for(const url of familyFiles){
    const source=await readFile(url,"utf8");
    for(const pattern of banned)
      assert.equal(pattern.test(source),false,`${url.pathname} contains banned family claim ${pattern}`);
  }
});
