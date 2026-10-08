import test from "node:test";
import assert from "node:assert/strict";
import { availabilityInput } from "./coaching-contracts";
import { saveAvailability } from "./coaching.server";
import { coachAvailable } from "./commerce/availability";
import type { Availability } from "./pd/types";
test('availability rejects same-day duplicate and overlapping intervals but allows adjacency',async()=>{
 const first={weekday:'Mon' as const,start:'16:00',end:'18:00'};
 for(const second of [first,{...first,start:'17:00',end:'19:00'},{...first,start:'16:30',end:'17:00'}]){
  const input={windows:[first,second]};
  assert.equal(availabilityInput.safeParse(input).success,false);
  await assert.rejects(()=>saveAvailability('no-account',input),/cannot overlap/);
 }
 assert.equal(availabilityInput.safeParse({windows:[first,{...first,start:'18:00',end:'20:00'}]}).success,true);
 assert.equal(availabilityInput.safeParse({windows:[first,{...first,weekday:'Tue'}]}).success,true);
});
test('availability input uses real clocks and club hours before any coach lookup',async()=>{
 const window={weekday:'Mon' as const,start:'16:00',end:'20:00'};
 assert.ok(availabilityInput.safeParse({windows:[window]}).success);
 assert.ok(availabilityInput.safeParse({windows:[]}).success);
 assert.ok(availabilityInput.safeParse({windows:[{weekday:'Sun',start:'13:00',end:'20:00'}]}).success);
 for(const w of [{...window,start:'99:00'},{...window,start:'16:60'},{...window,end:'24:00'},{...window,start:'15:00'},{...window,end:'21:00'},{...window,start:'18:00',end:'17:00'}]){
  assert.equal(availabilityInput.safeParse({windows:[w]}).success,false);
  await assert.rejects(()=>saveAvailability('no-account',{windows:[w]}),/Availability|Invalid string/);
 }
 assert.equal(availabilityInput.safeParse({windows:[{...window,coachId:'other'}]}).success,false);
});
test('legacy availability rejects malformed clocks and values but preserves supported formats',()=>{
 const row={id:'window',coachId:'c',weekday:'Mon',window:'16:00–20:00'};
 const check=(window:string)=>coachAvailable([{...row,window}],'c','2026-10-05','18:00',30);
 assert.equal(check('16:00–20:00'),true);
 assert.equal(check('4:00–8:00 PM'),true);
 for(const value of ['16:99–20:00','16:00–20:99','14:00 PM–8:00 PM','0:00 PM–8:00 PM','16:00–99:00','junk 16:00–20:00','16:00–20:00 extra'])assert.equal(check(value),false,value);
 for(const duration of [0,-1,NaN,Infinity,30.5,181])assert.equal(coachAvailable([row],'c','2026-10-05','18:00',duration),false);
 assert.equal(coachAvailable([row],'c','2026-10-05','18:99',30),false);
 assert.equal(coachAvailable([{...row,window:null} as unknown as Availability],'c','2026-10-05','18:00',30),false);
});
