import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDevelopment } from './empty';
import { seedDevelopment } from './seed';
import { scopeForViewer, canAccessAthlete, canCoachAthlete, filterDevelopmentData, authorizeMessage } from './access';
import { mergeScopedFile, hydrateWorkingFile } from './file';
import { mergeDraft } from './draft';
import { clubDayIso, dailyLoad } from './engines';
import { phaseFromSlice } from './programs';
import { canReschedule } from './core-algorithms.js';
import type { AthleteSlice } from './context';

function fixture() {
  const data = seedDevelopment();
  data.coaches = [{id:'coach',name:'Dual role',email:'parent@example.invalid',active:true,specialties:[]}];
  data.families = [{id:'own',email:'parent@example.invalid',name:'Own',parentName:'Parent',phone:'',athleteIds:['child']},
    {id:'other',email:'other@example.invalid',name:'Other',parentName:'Other',phone:'',athleteIds:['coached','unrelated']}];
  const template=data.athletes[1];
  data.athletes = [
    {...template,id:'child',familyId:'own',coachIds:[],notes:'Child private notes'},
    {...template,id:'coached',familyId:'other',coachIds:['coach'],notes:'Coached private notes'},
    {...template,id:'unrelated',familyId:'other',coachIds:[],notes:'Unrelated private notes'},
  ];
  data.bookings=[];
  data.messages=data.athletes.flatMap(a=>[{id:`m-${a.id}`,athleteId:a.id,body:'private',channel:'coach' as const,fromName:'Coach',fromRole:'coach' as const,createdAt:'2026-01-01'}]);
  return data;
}
const viewer={role:'coach' as const,email:'parent@example.invalid',name:'Parent',playerName:''};

test('coach-parent has household access without coach privileges on their own unassigned child',()=>{
  const data=fixture(),scope=scopeForViewer(viewer,data),visible=filterDevelopmentData(data,scope);
  assert.equal(canAccessAthlete(scope,'child'),true);
  assert.equal(canCoachAthlete(scope,'child'),false);
  assert.equal(canCoachAthlete(scope,'coached'),true);
  assert.equal(canAccessAthlete(scope,'unrelated'),false);
  assert.equal(visible.athletes.find(a=>a.id==='child')?.notes,'');
  assert.equal(visible.athletes.find(a=>a.id==='coached')?.notes,'Coached private notes');
  assert.deepEqual(visible.messages.map(m=>m.athleteId),['coached']);
  assert.throws(()=>authorizeMessage(scope,{athleteId:'child',body:'x',channel:'coach'}),/Forbidden/);
  const forged=structuredClone(visible);
  forged.athletes.find(a=>a.id==='child')!.notes='forged';
  forged.lessons.push({id:'forged',athleteId:'child',date:clubDayIso(),coachId:'coach',focus:'forged',minutes:30,notes:''});
  const saved=mergeScopedFile(data,forged,scope);
  assert.equal(saved.athletes.find(a=>a.id==='child')?.notes,'Child private notes');
  assert.ok(!saved.lessons.some(l=>l.id==='forged'));
});

test('paid bookings grant coach access, cancellation and deactivation remove only that grant',()=>{
  const data=fixture();data.bookings=[{id:'paid',athleteId:'unrelated',coachId:'coach',serviceId:'s1',date:'2027-01-01',time:'17:00',price:154,status:'paid'}];
  assert.equal(canCoachAthlete(scopeForViewer(viewer,data),'unrelated'),true);
  data.bookings[0].status='cancelled';
  assert.equal(canAccessAthlete(scopeForViewer(viewer,data),'unrelated'),false);
  assert.equal(canCoachAthlete(scopeForViewer(viewer,data),'coached'),true);
  data.bookings[0].status='completed';data.coaches[0].active=false;
  assert.equal(canAccessAthlete(scopeForViewer(viewer,data),'unrelated'),false);
  assert.equal(canCoachAthlete(scopeForViewer(viewer,data),'coached'),false);
  assert.equal(canAccessAthlete(scopeForViewer(viewer,data),'child'),true);
});

test('education belongs to the verified viewer and prescription history cannot be edited or deleted',()=>{
  const data=fixture();data.educationProgress={'parent@example.invalid':['pit-1:0'],'other@example.invalid':['hit-1:0']};
  data.throwingAssignments=[{id:'old',athleteId:'coached',templateId:'cmd-pit',dayType:'Recovery'}];
  const scope=scopeForViewer(viewer,data),incoming=filterDevelopmentData(data,scope);
  assert.equal(incoming.educationProgress['other@example.invalid'],undefined);
  incoming.educationProgress={'parent@example.invalid':['pit-1:1','forged'],'other@example.invalid':[]};
  incoming.throwingAssignments=[{id:'old',athleteId:'coached',templateId:'vel-pit',dayType:'Velocity'},
    {id:'new',athleteId:'coached',templateId:'vel-pit',dayType:'Velocity',createdBy:'forged'}];
  const saved=mergeScopedFile(data,incoming,scope);
  assert.deepEqual(saved.educationProgress['parent@example.invalid'],['pit-1:1']);
  assert.deepEqual(saved.educationProgress['other@example.invalid'],['hit-1:0']);
  assert.equal(saved.throwingAssignments.find(a=>a.id==='old')?.templateId,'cmd-pit');
  assert.equal(saved.throwingAssignments[0].createdBy,viewer.email);
});

test('three-way retry preserves unrelated remote edits and deduplicates an uncertain successful save',()=>{
  const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
  local.athletes[0].city='Local city';remote.athletes[1].city='Remote city';remote.revision=8;
  const merged=mergeDraft(base,local,remote);
  assert.equal(merged.athletes[0].city,'Local city');assert.equal(merged.athletes[1].city,'Remote city');assert.equal(merged.revision,8);
  assert.deepEqual(mergeDraft(base,local,{...local,revision:9}),{...local,revision:9});
  remote.athletes[0].city='Conflicting city';assert.throws(()=>mergeDraft(base,local,remote),/Conflicting edits/);
});

test('older working files hydrate new arrays without seeding players or replacing stored data',()=>{
  const data=emptyDevelopment();const hydrated=hydrateWorkingFile({throwingAssignments:[{id:'old',athleteId:'real',templateId:'cmd-pit',dayType:'Recovery'}]},data);
  assert.equal(hydrated.athletes.length,0);assert.deepEqual(hydrated.strengthAssignments,[]);assert.deepEqual(hydrated.educationProgress,{});
  assert.equal(hydrated.throwingAssignments[0].id,'old');
  assert.deepEqual(hydrateWorkingFile(JSON.parse(JSON.stringify(hydrated)),data),hydrated);
});

test('an older open client preserves newly introduced fields when saving another edit',()=>{
  const full=fixture();full.educationProgress={'parent@example.invalid':['pit-1:0']};
  full.throwingAssignments=[{id:'prescribed',athleteId:'coached',templateId:'cmd-pit',dayType:'Recovery'}];
  full.throwingDays=[{id:'day',athleteId:'coached',assignmentId:'prescribed',date:clubDayIso(),dayType:'Recovery'}];
  const scope=scopeForViewer(viewer,full),incoming=filterDevelopmentData(full,scope);
  for(const key of ['throwingDays','strengthAssignments','educationProgress'] as const) delete (incoming as Partial<typeof incoming>)[key];
  incoming.athletes[0].city='Saved by an older client';
  const saved=mergeScopedFile(full,incoming,scope);
  assert.deepEqual(saved.throwingDays,full.throwingDays);assert.deepEqual(saved.educationProgress,full.educationProgress);
  assert.equal(saved.athletes[0].city,'Saved by an older client');
});

test('club clock and reschedule boundary handle midnight, DST and month rollover',t=>{
  assert.equal(clubDayIso(new Date('2027-01-01T05:59:00Z')),'2026-12-31');
  assert.equal(clubDayIso(new Date('2027-01-01T06:00:00Z')),'2027-01-01');
  assert.equal(clubDayIso(new Date('2027-03-14T08:00:00Z')),'2027-03-14');
  t.mock.timers.enable({apis:['Date'],now:new Date('2027-01-01T05:00:00Z')});
  const data=fixture();data.policy.rescheduleDaysNotice=5;data.policy.reschedulesPerMonth=1;
  data.bookings=[{id:'used',athleteId:'child',coachId:'coach',serviceId:'s2',date:'2027-01-07',time:'23:00',status:'paid',price:1,rescheduledMonth:'2026-12'}];
  assert.equal(canReschedule(data.bookings[0],data.families[0],data).ok,false);
  data.bookings=[];const booking={date:'2027-01-05',time:'23:00'};
  assert.equal(canReschedule(booking,data.families[0],data).ok,true);
  t.mock.timers.tick(1);assert.equal(canReschedule(booking,data.families[0],data).ok,false);
});

test('old outings stop affecting season inference and tracked bullpens reach workload without double counting',t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2027-10-20T18:00:00Z')});
  const athlete=fixture().athletes[0];athlete.tags=[];athlete.notes='';athlete.birthDate='2012-01-01';
  const slice={athlete,intake:undefined,goals:[],armCare:[],plans:[],outings:[{date:'2026-09-01',pitches:20}],
    bullpens:[{date:'2027-10-20',pitches:15}],workload:[]} as unknown as AthleteSlice;
  assert.equal(phaseFromSlice(slice),'Accumulation');
  assert.equal(dailyLoad(slice).history.at(-1),15);
  slice.workload=[{id:'w',athleteId:athlete.id,date:'2027-10-20',throws:30,rpe:3}];
  assert.equal(dailyLoad(slice).history.at(-1),30);
});

test('coach training families contain assigned athlete IDs and exclude other household purchase plans',()=>{
 const data=fixture();data.families[0].plan={type:'development',lessonCredits:3};data.families[1].plan={type:'performance',lessonCredits:999};
 const filtered=filterDevelopmentData(data,scopeForViewer(viewer,data));
 assert.deepEqual(filtered.families.find(f=>f.id==='other')!.athleteIds,['coached']);
 assert.equal(filtered.families.find(f=>f.id==='other')!.plan,undefined);
 assert.equal(filtered.families.find(f=>f.id==='own')!.plan?.lessonCredits,3);
 const admin=filterDevelopmentData(data,scopeForViewer({...viewer,role:'admin'},data));
 assert.deepEqual(admin.families[1].athleteIds,['coached','unrelated']);
 assert.equal(admin.families[1].plan?.lessonCredits,999);
});
