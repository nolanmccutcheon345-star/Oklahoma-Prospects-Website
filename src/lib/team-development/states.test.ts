import test from "node:test";
import assert from "node:assert/strict";
import { compliance, dailyTransition, lateCompletionDecision } from "./states";

test("compliance uses half-up integer rounding and eligibility exclusions",()=>{
  const items=Array.from({length:8},(_,i)=>({state:i===0?"completed":"missed",dueDate:"2026-10-20",completedOn:i===0?"2026-10-20":null}));
  assert.equal(compliance(items).completionPct,13);
  assert.deepEqual(compliance([{state:"missed",dueDate:"2026-10-20",paused:true}]),{eligible:0,completed:0,onTime:0,completionPct:null,onTimePct:null});
});
test("daily state transitions never manufacture make-up work",()=>{
  assert.equal(dailyTransition({state:"assigned",dueDate:"2026-10-20",phaseEndDate:"2026-10-30",lateCreditWindowEnd:"2026-10-27",today:"2026-10-21",paused:false}),"missed");
  assert.equal(dailyTransition({state:"missed",dueDate:"2026-10-20",phaseEndDate:"2026-10-30",lateCreditWindowEnd:"2026-10-27",today:"2026-10-28",paused:false}),"expired");
  assert.equal(dailyTransition({state:"assigned",dueDate:"2026-10-20",phaseEndDate:"2026-10-30",lateCreditWindowEnd:"2026-10-27",today:"2026-10-28",paused:true}),"assigned");
});
test("late throwing completion requires ceiling and rest on actual date",()=>{
  assert.deepEqual(lateCompletionDecision({today:"2026-10-22",phaseEndDate:"2026-10-30",lateCreditWindowEnd:"2026-10-27",throwing:true,ceilingApproved:false,restSatisfied:true}),{ok:false,reason:"ceiling_block"});
  assert.deepEqual(lateCompletionDecision({today:"2026-10-22",phaseEndDate:"2026-10-30",lateCreditWindowEnd:"2026-10-27",throwing:true,ceilingApproved:true,restSatisfied:true}),{ok:true,isLate:true});
});
