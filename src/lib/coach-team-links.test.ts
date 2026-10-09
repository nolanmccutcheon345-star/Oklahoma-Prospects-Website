import test from "node:test";
import assert from "node:assert/strict";
import { publicTeamLinksFor } from "./coach-team-links.server";

const coaches=[
  {id:"coach-1",email:"ONE@example.invalid",active:true},
  {id:"coach-2",email:"two@example.invalid",active:false},
];
const club={teams:[
  {id:"t-a",name:"Prospects 15U Majors",sport:"baseball",age:"15U",headCoach:"Coach One",coachEmail:" one@example.invalid ",closed:false,roster:[{name:"Minor Athlete",medical:"secret"}],notes:"private"},
  {id:"t-b",name:"Prospects 15U AAA",sport:"baseball",age:"15U",headCoach:"Coach One",coachEmail:"ONE@EXAMPLE.INVALID",closed:false,feeLock:{amount:1400}},
  {id:"t-closed",name:"Former team",sport:"baseball",age:"14U",headCoach:"Coach One",coachEmail:"one@example.invalid",closed:true},
  {id:"t-other",name:"Another Coach",sport:"softball",age:"12U",headCoach:"Coach Two",coachEmail:"two@example.invalid",closed:false},
  {id:"t-incomplete",name:"Unconfirmed",sport:"baseball",age:"14U",headCoach:"",coachEmail:"one@example.invalid",closed:false},
]};
test("approved coach team links support multiple active teams per age without leaking private data",()=>{
 const links=publicTeamLinksFor("coach-1",coaches,club,false);
 assert.deepEqual(links.map(t=>t.name),["Prospects 15U AAA","Prospects 15U Majors"]);
 assert.deepEqual(Object.keys(links[0]).sort(),["id","name","sport","age"].sort());
 assert.doesNotMatch(JSON.stringify(links),/one@example|Minor Athlete|medical|amount|private/);
 assert.deepEqual(publicTeamLinksFor("coach-2",coaches,club,false),[]);
 assert.deepEqual(publicTeamLinksFor("coach-1",coaches,club,true),[],"demo must not become published");
 assert.deepEqual(publicTeamLinksFor("coach-1",coaches,{},false),[]);
 assert.deepEqual(publicTeamLinksFor("forged",coaches,club,false),[]);
});
