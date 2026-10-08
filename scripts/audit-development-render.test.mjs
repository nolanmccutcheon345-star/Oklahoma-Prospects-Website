import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {auditHarness} from './audit-support.mjs';

// Real provider/component events -> real save command -> migrated disposable DB.
// These release gates deliberately FAIL when a promised workflow loses data.
test('development screens retain coaching work through save and remount',async(t)=>{
 const h=await auditHarness(),{api,sql}=h;
 const dom=new JSDOM('<div id="root"></div>',{url:'https://audit.example.invalid/account'});
 const old={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const temp=await mkdtemp('scripts/.audit-ui-'),outfile=temp+'/client.mjs';
 let root,ctx,view='none';
 const pending=[];
 const bridge={user:{id:'ui-coach'},
  loadPdDesk:()=>track(api.loadDeskForUser(bridge.user.id)),
  loadPdAthlete:({data})=>track(api.loadAthleteForUser(bridge.user.id,data.athleteId)),
  savePdDesk:({data})=>bridge.failSave ? Promise.reject(new Error("Simulated offline save")) : track(api.saveDeskForUser(bridge.user.id,data.file)),
  writePdMessage:({data})=>track(api.writeMessageForUser(bridge.user.id,data))};
 function track(p){pending.push(p);return p;}
 globalThis.__auditUi=bridge;
 async function flush(){for(let i=0;i<4;i++)await act(async()=>{await Promise.all(pending.splice(0));});}
 try{
  for(const [id,role,name] of [['ui-coach','coach','Audit Coach'],['ui-parent','parent','Audit Parent']]){
   await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${id},${name},${id+'@audit.example.invalid'},true,now(),now())`;
   await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${name},${id+'@audit.example.invalid'},${role},${'fam-'+id})`;
  }
  await api.clubIdentity('ui-parent');
  await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,coach_ids,profile) values('ui-athlete','ui-parent','ui-parent@audit.example.invalid','Audit Athlete','2012-01-01','["ui-c"]'::jsonb,'{"sport":"baseball","throws":"R","bats":"R"}'::jsonb)`;
  const file=api.emptyDevelopment();file.coaches=[{id:'ui-c',name:'Audit Coach',email:'ui-coach@audit.example.invalid',active:true,specialties:['Pitching']}];
  file.bullpens=[{id:'ui-bullpen',athleteId:'ui-athlete',date:api.chicagoDate(),pitches:0,tci:0,notes:'',chart:[]}];
  await api.writeWorkingFile(file);
  await build({stdin:{contents:`export * from './src/lib/pd/context';export * from './src/components/pd/program-views';export * from './src/components/pd/bullpen-tracker';`,resolveDir:process.cwd(),loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'audit-ui-boundaries',setup(b){
   b.onResolve({filter:/use-current-user$/},()=>({path:'user',namespace:'audit-ui'}));
   b.onResolve({filter:/^\.\/desk$/},a=>a.importer.endsWith('/pd/context.tsx')?{path:'desk',namespace:'audit-ui'}:undefined);
   b.onLoad({filter:/.*/,namespace:'audit-ui'},a=>({contents:a.path==='user'?'export const useCurrentUser=()=>globalThis.__auditUi.user;':'export const {loadPdDesk,loadPdAthlete,savePdDesk,writePdMessage}=globalThis.__auditUi;',loader:'js'}));
  }}]});
  const ui=await import(pathToFileURL(process.cwd()+'/'+outfile));
  function Probe(){ctx=ui.useDevelopment();if(!ctx.pdReady||!ctx.slice('ui-athlete'))return null;
   return view==='strength'?createElement(ui.StrengthProgramView,{slice:ctx.slice('ui-athlete'),role:'coach'}):view==='bullpen'?createElement(ui.BullpenTracker,{pen:ctx.data.bullpens[0],interactive:true}):null;
  }
  async function mount(user='ui-coach',nextView='none'){
   if(root)await act(async()=>root.unmount());
   bridge.user={id:user};view=nextView;root=createRoot(document.getElementById('root'));
   await act(async()=>{root.render(createElement(ui.DevelopmentProvider,null,createElement(Probe)));});await flush();
  }
  await mount();
  await t.test('guided lesson saves recaps, velocity, intervention and bullpen to the database',async()=>{
   await act(async()=>ctx.publishLesson({athleteId:'ui-athlete',serviceId:'s2',lessonType:'Private',focus:'Audit focus',minutes:30,homeworkIds:[],iqModuleId:null,intervention:{method:'Constraint',constraint:'Balance',cue:'Stay tall',outcome:'Retained'},recaps:{parent:'Parent recap',player:'Player recap',coach:'Private coach recap'},velocities:[61,62],coachId:'ui-c',bullpen:{pitches:1,tci:100,notes:'Audit bullpen',chart:[{intent:{row:2,col:2},actual:{row:2,col:2},score:4}]}}));
   await flush();const saved=await api.readWorkingFile();
   assert.equal(saved.lessons[0].focus,'Audit focus');assert.equal(saved.velocity[0].mph,62);
   assert.equal(saved.interventions.length,1);assert.equal(saved.bullpens[0].chart.length,1);
   await mount('ui-parent');assert.equal(ctx.data.lessons[0].notes,'Parent recap');
   assert.ok(ctx.data.messages.some(m=>m.body==='Player recap: Player recap'));
  });
  await t.test('RELEASE GATE: published lesson uses the actual club day',async()=>{
   assert.equal((await api.readWorkingFile()).lessons[0].date,api.chicagoDate());
  });
  await t.test('strength sets persist for the athlete after reload',async()=>{
   await act(async()=>ctx.logStrengthSet({athleteId:'ui-athlete',date:api.chicagoDate(),exerciseId:'audit-exercise',setNumber:1,weight:10,reps:8,rpe:4}));await flush();
   await mount('ui-parent');assert.equal(ctx.data.strengthSets[0].weight,10);assert.equal(ctx.data.strengthLog[0].value,10);
  });
  await t.test('RELEASE GATE: assigning a new throwing plan retains previous assignment history',async()=>{
   await mount();
   await act(async()=>ctx.assignThrowing({athleteId:'ui-athlete',templateId:'cmd-pit',dayType:'Recovery'}));await flush();
   await act(async()=>ctx.assignThrowing({athleteId:'ui-athlete',templateId:'vel-pit',dayType:'Velocity'}));await flush();
   assert.equal((await api.readWorkingFile()).throwingAssignments.length,2);
  });
  await t.test('RELEASE GATE: family throwing-day selection survives save and reload',async()=>{
   await mount('ui-parent');const assignment=ctx.data.throwingAssignments[0];
   await act(async()=>ctx.selectThrowingDay('ui-athlete',assignment.id,'Recovery'));await flush();
   await mount('ui-parent');assert.equal(ctx.data.throwingDays[0].dayType,'Recovery');assert.equal(ctx.data.throwingAssignments[0].dayType,'Velocity');
  });
  await t.test('RELEASE GATE: coach strength customization survives remount',async()=>{
   await mount('ui-coach','strength');
   const select=document.querySelectorAll('select')[1];assert.ok(select);
   const chosen=[...select.options].find(o=>o.value!==select.value).value;
   await act(async()=>{select.value=chosen;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});await flush();
   assert.equal(select.value,chosen);
   await mount('ui-coach','strength');assert.equal(document.querySelectorAll('select')[1].value,chosen);
  });
  await t.test('only reviewed published strength versions reach the family and retain their saved prescription',async()=>{
   await mount('ui-parent','strength');
   assert.equal(ctx.data.strengthAssignments.length,0);
   assert.equal(document.querySelector('[data-run-session]').disabled,true);
   await mount('ui-coach','strength');
   assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Publish reviewed program').disabled,true);
   await act(async()=>ctx.updateAthleteProfile('ui-athlete',{birthDate:'2012-01-01',sport:'baseball',position:'Pitcher'}));await flush();
   await sql`insert into athlete_assessments(id,athlete_id,discipline,coach_user_id,completed_at,notes) values('ui-assessment','ui-athlete','Pitching','ui-coach',now(),'Disposable test completion')`;
   await mount('ui-coach','strength');
   const publish=[...document.querySelectorAll('button')].find(b=>b.textContent==='Publish reviewed program');
   assert.equal(publish.disabled,false);await act(async()=>publish.click());await flush();
   const saved=(await api.readWorkingFile()).strengthAssignments;
   const assigned=saved.find(a=>a.status==='published');assert.ok(assigned);assert.ok(saved.some(a=>a.status==='draft'));
   await mount('ui-parent','strength');
   assert.deepEqual(ctx.data.strengthAssignments,[assigned]);
   assert.match(document.body.textContent,/Assigned strength program/);
   assert.equal(document.querySelector('[data-run-session]').disabled,false);
   assert.deepEqual(ctx.slice('ui-athlete').strengthAssignments[0].program,assigned.program);
  });
  await t.test('RELEASE GATE: tracker pitch additions survive remount',async()=>{
   await mount('ui-coach','bullpen');
   const before=ctx.data.bullpens[0].chart.length;
   await act(async()=>document.querySelector('button[aria-label="Row 2 column 2"]').click());
   await act(async()=>document.querySelector('button[aria-label="Row 2 column 2"]').click());await flush();
   assert.match(document.body.textContent,new RegExp(`${before+1} pitches scored`));
   await mount('ui-coach','bullpen');assert.match(document.body.textContent,new RegExp(`${before+1} pitches scored`));
  });
  await t.test('education progress persists for its account and never appears on another account',async()=>{
   await mount('ui-coach');
   assert.deepEqual(ctx.educationFor('ui-coach@audit.example.invalid'),[]);
   await act(async()=>ctx.toggleEducation('ui-coach@audit.example.invalid','pit-1:0'));await flush();
   await mount('ui-coach');assert.deepEqual(ctx.educationFor('ui-coach@audit.example.invalid'),['pit-1:0']);
   await mount('ui-parent');assert.deepEqual(ctx.educationFor('ui-coach@audit.example.invalid'),[]);
  });
  await t.test('failed save can be retried without refresh or losing the draft',async()=>{
   await mount('ui-parent');bridge.failSave=true;
   await act(async()=>ctx.logStrengthSet({athleteId:'ui-athlete',date:api.chicagoDate(),exerciseId:'retry-exercise',setNumber:1,weight:12,reps:7,rpe:4}));await flush();
   assert.match(document.body.textContent,/Simulated offline save/);
   assert.ok(!((await api.readWorkingFile()).strengthSets.some(s=>s.exerciseId==='retry-exercise')));
   bridge.failSave=false;
   await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry saved changes').click());await flush();
   await mount('ui-parent');assert.equal(ctx.data.strengthSets.find(s=>s.exerciseId==='retry-exercise').weight,12);
  });
  await t.test('a stale athlete link hydrates and selects the newly authorized record',async()=>{
   await mount('ui-coach');
   await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,coach_ids,profile) values('ui-new','ui-parent','ui-parent@audit.example.invalid','New Athlete','2012-01-01','["ui-c"]'::jsonb,'{"sport":"baseball"}'::jsonb)`;
   assert.ok(!ctx.data.athletes.some(a=>a.id==='ui-new'));
   await act(async()=>ctx.openAthlete('ui-new'));await flush();
   assert.equal(ctx.selectedAthleteId,'ui-new');assert.ok(ctx.slice('ui-new'));
  });
  await t.test('working-record export and restore in the disposable database preserves versions and education',async()=>{
   const before=await api.readWorkingFile();
   const exported=JSON.parse(JSON.stringify(before));await api.writeWorkingFile(exported);
   const restored=await api.readWorkingFile();
   for(const key of ['strengthAssignments','throwingAssignments','throwingDays','strengthSets','educationProgress','lessons','bullpens']) assert.deepEqual(restored[key],before[key]);
  });
 }finally{
  if(root)await act(async()=>root.unmount());dom.window.close();globalThis.window=old.window;globalThis.document=old.document;globalThis.IS_REACT_ACT_ENVIRONMENT=old.act;
  delete globalThis.__auditUi;await rm(temp,{recursive:true,force:true});await h.close();
 }
});
