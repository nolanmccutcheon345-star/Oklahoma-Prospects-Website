import test from "node:test";
import assert from "node:assert/strict";
import type { ClubRecord } from "./teams/types";
import { assertTryoutPreference, listedTryoutTeams } from "./tryout-preferences.server";

const base = {
  id: "team-12",
  name: "12U Navy",
  age: "12U",
  sport: "softball",
  closed: false,
  coachEmail: "assigned@example.invalid",
  staff: [{ email: "assistant@example.invalid", role: "Assistant Coach" }, { email: "bookkeeper@example.invalid", role: "Treasurer" }],
  roster: [{ id: "minor-secret", name: "Private athlete", parents: [{ email: "guardian@example.invalid" }] }],
  notes: "Private coaching notes",
} as unknown as ClubRecord["teams"][number];
const publisher = [
 {id:"published-a",name:"Published Coach",email:"assigned@example.invalid",program:"Softball"},
 {id:"published-b",name:"Assistant",email:"assistant@example.invalid",program:"Softball"},
 {id:"wrong-sport",name:"Other sport",email:"assistant@example.invalid",program:"Baseball"},
 {id:"published-treasurer",name:"Treasurer",email:"bookkeeper@example.invalid",program:"Softball"},
];
const teams = () => listedTryoutTeams([base], publisher);

test("public tryout choices include only published, actually assigned coaches; not private roster or contact", () => {
 const listed=teams();
 assert.deepEqual(listed,[{
  id:"team-12",name:"12U Navy",age:"12U",sport:"Softball",coaches:[
   {id:"published-a",name:"Published Coach"},{id:"published-b",name:"Assistant"}
  ],
 }]);
 assert.doesNotMatch(JSON.stringify(listed),/minor-secret|Private athlete|guardian@|assigned@|Private coaching notes/);
});

test("unpublished or closed teams do not produce public preferences", () => {
 assert.deepEqual(listedTryoutTeams([{...base,closed:true}],publisher),[]);
 assert.deepEqual(listedTryoutTeams([base],[]),[]);
 assert.deepEqual(listedTryoutTeams([{...base,coachEmail:"none@example.invalid",staff:[]}],publisher),[]);
 assert.deepEqual(listedTryoutTeams([{...base,sport:"baseball"}],publisher),[]);
});
test("server rejects forged, wrong-age, mismatched or inactive team/coach preference", () => {
 const listed=teams();
 for(const payload of [
  {preferredCoachId:"published-a"},
  {preferredTeamId:"forged"},
  {preferredTeamId:"team-12",sport:"Baseball"},
  {preferredTeamId:"team-12",age:"14U"},
  {preferredTeamId:"team-12",preferredCoachId:"not-published"},
  {preferredTeamId:"team-12",autoEnroll:true},
 ])assert.throws(()=>assertTryoutPreference(listed,{sport:"Softball",age:"12U",...payload}),/team|coach|enrollment|Choose/i);
 assert.doesNotThrow(()=>assertTryoutPreference(listed,{sport:"Softball",age:"12U"}));
 assert.doesNotThrow(()=>assertTryoutPreference(listed,{sport:"Softball",age:"12U",preferredTeamId:"team-12",preferredCoachId:"published-b",autoEnroll:false}));
});
