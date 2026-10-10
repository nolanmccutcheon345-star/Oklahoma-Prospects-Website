import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('request cards filter unresolved work, hide internal fields, and save assigned follow-ups',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/office'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const {act,createElement}=await import('react');const {createRoot}=await import('react-dom/client');
 const requests=[{id:'r1',kind:'tryout',status:'evaluated',created_at:'2026-10-09T18:00:00Z',payload:{player:'Sample Player',parent:'Sample Parent',email:'sample@example.invalid',sport:'Softball',age:'14U',season:'Spring 2027',autoEnroll:'false',preferredTeamId:''}},{id:'r2',kind:'contact',status:'resolved',created_at:'2026-10-09T18:00:00Z',payload:{name:'Resolved Person',message:'A question'}}];
 const fixture={requests,work:{work:[],notes:[],staff:[{id:'coach',name:'Sample Coach'}]},saved:[]};globalThis.__officeFixture=fixture;
 const mocks={
 "@/lib/teams/fee-api": `export const getFeeWorkspace=async()=>({teams:[]});`,
 '@/lib/portal-api':`export const getOfficeRequests=async()=>globalThis.__officeFixture.requests;`,
 '@/lib/tryout-events-api':`export const getPublicTryoutTeams=async()=>[];`,
 '@/lib/teams/store':`export const getTeamsClub=async()=>({ok:true,club:{teams:[]}});export const reviewTeamInquiry=async()=>({message:'saved'});`,
 '@/lib/front-office-api':`export const getRequestWork=async()=>globalThis.__officeFixture.work;export const saveRequestWork=async({data})=>{globalThis.__officeFixture.saved.push(data);globalThis.__officeFixture.work={...globalThis.__officeFixture.work,work:[{request_id:data.id,follow_up:data.status,assignee_id:data.assignee,updated_at:new Date().toISOString()}]};return {ok:true};};`
 };
 const out=resolve('artifacts/front-office-render.mjs');await mkdir('artifacts',{recursive:true});
 const result=await build({entryPoints:['src/components/commerce/office-requests.tsx'],bundle:true,platform:'node',format:'esm',write:false,external:['react','react/*','react-dom','react-dom/*'],plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}));}}]});await writeFile(out,result.outputFiles[0].text);
 const {OfficeRequests}=await import(pathToFileURL(out).href);const host=document.getElementById('root'),root=createRoot(host);
 try{
 await act(async()=>root.render(createElement(OfficeRequests)));
 assert.match(host.textContent,/Sample Player/);assert.doesNotMatch(host.textContent,/Resolved Person/);assert.doesNotMatch(host.textContent,/autoEnroll|preferredTeamId/);
 assert.equal(host.querySelector('article details').open,false);
 await act(async()=>host.querySelector('article summary').click());assert.equal(host.querySelector('article details').open,true);
 const form=host.querySelector('article form');const selects=form.querySelectorAll('select');
 await act(async()=>{selects[0].value='coach';selects[0].dispatchEvent(new dom.window.Event('change',{bubbles:true}));selects[1].value='closed';selects[1].dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(fixture.saved[0].assignee,'coach');assert.equal(fixture.saved[0].status,'closed');assert.equal(fixture.requests[0].status,'evaluated');assert.equal(host.querySelectorAll('article').length,0);
 const status=[...host.querySelectorAll('label')].find(l=>l.firstChild.textContent==='Status').querySelector('select');
 await act(async()=>{status.value='closed';status.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(host.querySelectorAll('article').length,2);
 }finally{await act(async()=>root.unmount());dom.window.close();delete globalThis.__officeFixture;await rm(out,{force:true});}
});
