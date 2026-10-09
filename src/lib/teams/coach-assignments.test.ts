import assert from "node:assert/strict";
import test from "node:test";
import { sampleClub } from "./seed";
import { addAssistantCoach, assignHeadCoach, assignedAssistantCoaches, isAssignedCoach } from "./coach-assignments";

test("head coach cannot also be added as assistant regardless of email casing", () => {
 const t = sampleClub().teams[0];
 const head = assignHeadCoach(t, {name:"Coach A",email:" COACH@EXAMPLE.INVALID "});
 assert.equal(head.coachEmail,"coach@example.invalid");
 assert.throws(()=>addAssistantCoach(head,{
  id:"duplicate",name:"Coach A",email:"coach@example.invalid",role:"Assistant coach",
  monthly:0,childId:"",applyAmount:0,w9:false,backgroundCheck:false,safeSport:false,expires:"",
 }),/already assigned/);
 assert.equal(isAssignedCoach(head,"COACH@example.invalid"),true);
});
test("adding distinct assistants works repeatedly, but never copies same coach twice", () => {
 const original=assignHeadCoach(sampleClub().teams[0],undefined);
 const member=(id:string,email:string)=>({id,name:id,email,role:"Assistant coach",monthly:0,childId:"",applyAmount:0,w9:false,backgroundCheck:false,safeSport:false,expires:""});
 const a=addAssistantCoach(original,member("one","one@example.invalid"));
 const b=addAssistantCoach(a,member("two","two@example.invalid"));
 assert.equal(assignedAssistantCoaches(b).length,original.staff.length+2);
 assert.throws(()=>addAssistantCoach(b,member("third","ONE@EXAMPLE.INVALID")),/already assigned/);
 assert.equal(a.staff.length,original.staff.length+1);
});
test("old head/assistant duplicate displays once without mutating payroll records", () => {
 const original=sampleClub().teams[0];
 const entry={id:"staff-dup",name:"Coach A",email:"head@example.invalid",role:"Assistant coach",monthly:800,childId:"",applyAmount:0,w9:true,backgroundCheck:true,safeSport:true,expires:""};
 const team={...original,headCoach:"Coach A",coachEmail:"head@example.invalid",staff:[entry,entry]};
 assert.deepEqual(assignedAssistantCoaches(team),[]);
 assert.equal(team.staff.length,2);
});
