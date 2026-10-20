import test from 'node:test';
import assert from 'node:assert/strict';
import {withRendered} from './render-component-support.mjs';

test('operational attendance UI preserves mixed guided drafts and submits only independent observation fields',async()=>{
 const lesson={id:'lesson',service:'Private lesson',player:'Synthetic athlete',startsAt:'2026-10-01T12:00:00.000Z',endsAt:'2026-10-01T13:00:00.000Z',recorded:false,requiresGuidedReview:false};
 const state={data:{canRecord:true,lessons:[lesson,{...lesson,id:'guided',requiresGuidedReview:true}]},saved:[],error:false};
 globalThis.__operationalLessonUi=state;
 try{
 await withRendered('src/components/coordinator/organization-lesson-completion.tsx','OrganizationLessonCompletion',{}, {
  '@/lib/pd/operational-lesson-api':`export const getOperationalLessonCompletions=async()=>{if(globalThis.__operationalLessonUi.error)throw Error('Attendance unavailable');return structuredClone(globalThis.__operationalLessonUi.data)};export const saveOperationalLessonCompletion=async({data})=>{globalThis.__operationalLessonUi.saved.push(data);globalThis.__operationalLessonUi.data.lessons[0].recorded=true;return {ok:true,recorded:true}};`,
 },async({host,act,dom,change})=>{
  await change(host.querySelector('select'),'guided');
  assert.match(host.textContent,/Unpublished guided evidence requires owner classification/);
  assert.equal(host.querySelector('form'),null);
  await change(host.querySelector('select'),'lesson');
  assert.equal(host.querySelector('button[type=submit]').disabled,true);
  await act(async()=>{
   const textarea=host.querySelector('textarea');
   Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Athlete attended and practiced the reviewed movement safely.');
   textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  });
  await act(async()=>host.querySelector('input[type=checkbox]').click());
  assert.equal(host.querySelector('button[type=submit]').disabled,false);
  await act(async()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.deepEqual(state.saved,[{bookingId:'lesson',expectedEndsAt:lesson.endsAt,attendance:'present',recap:'Athlete attended and practiced the reviewed movement safely.',qualifiedReview:true}]);
  await change(host.querySelector('select'),'lesson');
  assert.match(host.textContent,/observation has already been recorded/);
  assert.equal(host.querySelector('form'),null);
  state.error=true;
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Refresh attendance').click());
  assert.equal(host.querySelector('[role=alert]').textContent,'Attendance unavailable');
 });
 }finally{delete globalThis.__operationalLessonUi;}
});
