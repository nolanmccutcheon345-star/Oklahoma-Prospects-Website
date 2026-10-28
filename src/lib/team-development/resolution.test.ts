import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveAssignments, type TeamDevAssignmentScope, type TeamDevResolvedAssignment } from "./resolution";

const base = (id:string, program_type:string, scope:TeamDevAssignmentScope, target:{target_key:string;athlete_id?:string;position?:string}):TeamDevResolvedAssignment => ({
  id, program_type, scope, created_at: "2026-10-23T12:00:00Z",
  targets: [target],
});

test("individual override wins over selected, position and team for the same program type",()=>{
  const rows = [
    base("team","strength","team",{target_key:"team:t1"}),
    base("pos","strength","position",{target_key:"position:t1:P",position:"P"}),
    base("selected","strength","selected",{target_key:"athlete:a1",athlete_id:"a1"}),
    base("override","strength","override",{target_key:"athlete:a1",athlete_id:"a1"}),
  ];
  const result=resolveEffectiveAssignments(rows,"a1",["P"],"t1");
  assert.equal(result.length,1);
  assert.equal(result[0].id,"override");
});

test("ending a higher tier naturally restores the next lower tier",()=>{
  const rows = [
    base("team","strength","team",{target_key:"team:t1"}),
    base("pos","strength","position",{target_key:"position:t1:P",position:"P"}),
    base("selected","strength","selected",{target_key:"athlete:a1",athlete_id:"a1"}),
  ];
  assert.equal(resolveEffectiveAssignments(rows,"a1",["P"],"t1")[0].id,"selected");
  assert.equal(resolveEffectiveAssignments(rows.filter(r=>r.id!=="selected"),"a1",["P"],"t1")[0].id,"pos");
  assert.equal(resolveEffectiveAssignments(rows.filter(r=>!["selected","pos"].includes(r.id)),"a1",["P"],"t1")[0].id,"team");
});

test("different program types coexist rather than conflict",()=>{
  const rows = [
    base("strength","strength","team",{target_key:"team:t1"}),
    base("throwing","throwing","team",{target_key:"team:t1"}),
    base("skills","skills","position",{target_key:"position:t1:P",position:"P"}),
  ];
  const result=resolveEffectiveAssignments(rows,"a1",["P"],"t1");
  assert.deepEqual(result.map(r=>r.id).sort(),["skills","strength","throwing"]);
});
