import test from "node:test";
import assert from "node:assert/strict";
import { coachHasBookingWindow } from "./availability";
import type { Availability } from "../pd/types";
const schedule=(weekday:string,window:string):Availability[]=>[{id:'window',coachId:'coach',weekday,window}];
test('coach picker accepts valid recurring windows and rejects unusable schedules',()=>{
  assert.equal(coachHasBookingWindow([], 'coach'), false);
  assert.equal(coachHasBookingWindow(schedule('Mon–Fri','16:00–20:00'),'coach'),true);
  assert.equal(coachHasBookingWindow(schedule('Sat–Sun','1:00 PM–8:00 PM'),'coach'),true);
  assert.equal(coachHasBookingWindow(schedule('Fri–Mon','16:00–17:00'),'coach'),true);
  assert.equal(coachHasBookingWindow(schedule('Tue','19:30–20:00'),'coach'),true);
  assert.equal(coachHasBookingWindow(schedule('Tue','16:00–20:00'),'other'),false);
  for(const [day,window] of [['Mon','10:00–12:00'],['Sat','12:00–13:00'],['Tue','19:45–20:00'],['Tue','20:00–21:00'],['Tue','18:00–17:00'],['Unknown','16:00–20:00'],['Tue','invalid']])
    assert.equal(coachHasBookingWindow(schedule(day,window),'coach'),false,`${day} ${window}`);
});

test('coach windows must fit the actual offered duration',()=>{
  const rows=schedule('Tue','18:00–19:00');
  assert.equal(coachHasBookingWindow(rows,'coach',30),true);
  assert.equal(coachHasBookingWindow(rows,'coach',60),true);
  assert.equal(coachHasBookingWindow(rows,'coach',75),false);
  for(const minutes of [0,-1,NaN,Infinity,30.5,181]) assert.equal(coachHasBookingWindow(rows,'coach',minutes),false);
});
