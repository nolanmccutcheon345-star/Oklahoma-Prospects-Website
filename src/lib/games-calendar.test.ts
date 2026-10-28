import test from "node:test";
import assert from "node:assert/strict";
import { gamesCalendarEvent } from "./games-calendar";
import type {PublicGameEvent} from "./games-contracts";
test("Games calendar export uses Chicago local first pitch without inventing game duration",()=>{
 const game:PublicGameEvent={id:"11111111-2222-4333-8444-555555555555",revision:1,sport:"Softball",ageGroup:"14U",
  teamName:"Prospects; Blue",opponent:"Opponent\\Line",date:"2030-06-11",startTime:"13:15",venue:"Field, One",
  status:"scheduled",ourRuns:0,oppRuns:0,inning:"",videoId:"",videoKind:"none"};
 const ics=gamesCalendarEvent(game);
 assert.match(ics,/BEGIN:VCALENDAR\r\nVERSION:2.0/);
 assert.match(ics,/DTSTART;TZID=America\/Chicago:20300611T131500/);
 assert.doesNotMatch(ics,/DTEND|DURATION:/);
 assert.ok(ics.includes("Prospects\\; Blue"));
 assert.ok(ics.includes("Field\\, One"));
 assert.ok(ics.includes("Opponent\\\\Line"));
 assert.match(ics,/UID:11111111-2222-4333-8444-555555555555@prospectsbaseball.club/);
});
