import test from 'node:test';
import assert from 'node:assert/strict';
import { availableLessonTimes } from './available-lesson-times';
import { chicagoInstant } from '../scheduling';
const schedule = [{id:'n',coachId:'nolan',weekday:'Mon–Fri',window:'16:00–20:00'}];
const now = new Date('2026-10-10T02:00:00Z'); // Friday 9 PM Central
const base = {date:'2026-10-09',duration:75,coachId:'nolan',availability:schedule,occupied:[],now};
test('after closing finds next instructor date with the full lesson inside opening hours',()=>{
 const result=availableLessonTimes(base);
 assert.deepEqual(result.slots,[]);
 assert.equal(result.nextAvailable?.date,'2026-10-12');
 assert.deepEqual(result.nextAvailable?.slots.map(s=>s.value),['16:00','16:30','17:00','17:30','18:00','18:30']);
});
test('next dates respect occupied instructor/player/space time, not just recurring hours',()=>{
 const occupied=Array.from({length:16},(_,i)=>({slot_at:new Date(chicagoInstant('2026-10-12','16:00').getTime()+i*15*60000)}));
 assert.equal(availableLessonTimes({...base,occupied}).nextAvailable?.date,'2026-10-13');
 const result=availableLessonTimes({...base,date:'2026-10-12',occupied:[{slot_at:chicagoInstant('2026-10-12','17:00')}]});
 assert.deepEqual(result.slots.map(s=>s.value),['17:30','18:00','18:30']);
 assert.equal(result.nextAvailable,null);
});
test('no schedule produces no invented times, and Central DST dates stay correct',()=>{
 assert.equal(availableLessonTimes({...base,availability:[]}).nextAvailable,null);
 assert.equal(availableLessonTimes({...base,coachId:'other'}).nextAvailable,null);
 const result=availableLessonTimes({...base,date:'2026-10-31',now:new Date('2026-11-01T02:00:00Z'),availability:[{id:'n',coachId:'nolan',weekday:'Sun',window:'13:00–15:00'}]});
 assert.equal(result.nextAvailable?.date,'2026-11-01');
 assert.deepEqual(result.nextAvailable?.slots.map(s=>s.value),['13:00','13:30']);
});
