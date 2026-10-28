import assert from "node:assert/strict";
import test from "node:test";
import { publishedTryoutSeasons } from "./tryout-season-options";
import type { TryoutEvent } from "./tryout-events-contracts";
const event = (patch: Partial<TryoutEvent> = {}): TryoutEvent => ({
 id:"example",revision:0,sport:"Softball",ageGroups:["12U","14U"],season:"Spring 2027",
 date:"2027-03-01",startTime:"13:00",endTime:"15:00",location:"Indoor Facility",capacity:30,
 status:"published",...patch,
});
test("age and sport season options match published events exactly and deduplicate",()=>{
 const list=[event(),event({id:"e2",season:"spring 2027"}),event({id:"e3",season:"Summer 2027"}),event({id:"draft",season:"Fall 2027",status:"draft"}),event({id:"other",sport:"Baseball",season:"Winter 2027"}),event({id:"old",ageGroups:["16U"],season:"Older 2027"})];
 assert.deepEqual(publishedTryoutSeasons(list,"Softball","12U"),["Spring 2027","Summer 2027"]);
 assert.deepEqual(publishedTryoutSeasons(list,"Baseball","12U"),["Winter 2027"]);
 assert.deepEqual(publishedTryoutSeasons(list,"Softball","16U"),["Older 2027"]);
 assert.deepEqual(publishedTryoutSeasons(list,"Softball","18U"),[]);
 assert.deepEqual(publishedTryoutSeasons(list,"Softball",""),[]);
});
