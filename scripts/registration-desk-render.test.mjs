import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';

test('coordinator desk renders records and filters without owner or mutation controls',async()=>{
 const temp=await mkdtemp('scripts/.registration-render-');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://test.invalid/registrations'});
 const old={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 let allowed=true,owner=false,readerCalls=0;
 globalThis.__registrationTestApi={
  getRegistrationAccess:async()=>({allowed,owner}),
  getRegistrationRows:async()=>[
   {id:'s',kind:'tryout',status:'open',created_at:new Date(),payload:{player:'Softball Fixture',sport:'Softball',parent:'Test Parent',email:'fixture@example.invalid'}},
   {id:'b',kind:'tryout',status:'open',created_at:new Date(),payload:{player:'Baseball Fixture',sport:'Baseball'}},
   {id:'c',kind:'contact',status:'open',created_at:new Date(),payload:{name:'Inquiry Fixture',message:'A test contact message'}}],
  getRegistrationReaders:async()=>{readerCalls++;return [];},setRegistrationReader:async()=>{throw new Error('Unexpected mutation');}
 };
 let root;
 try{
  const outfile=temp+'/desk.mjs';
  await build({entryPoints:['src/components/registration-desk.tsx'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'test-api',setup(b){b.onResolve({filter:/registrations-api$/},()=>({path:'api',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export const {getRegistrationAccess,getRegistrationRows,getRegistrationReaders,setRegistrationReader}=globalThis.__registrationTestApi;`,loader:'js'}));}}]});
  const {RegistrationDesk}=await import(pathToFileURL(process.cwd()+'/'+outfile));
  root=createRoot(document.getElementById('root'));
  await act(async()=>{root.render(createElement(RegistrationDesk));});
  assert.match(document.body.textContent,/Softball Fixture/);assert.match(document.body.textContent,/Baseball Fixture/);assert.match(document.body.textContent,/Inquiry Fixture/);
  assert.equal(readerCalls,0);assert.doesNotMatch(document.body.textContent,/Owner controls|Enable viewing access|Save registration stage|Mark request resolved|Refund/);
  const sport=document.querySelectorAll('select')[0];
  await act(async()=>{sport.value='Softball';sport.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.match(document.body.textContent,/Softball Fixture/);assert.doesNotMatch(document.body.textContent,/Baseball Fixture|Inquiry Fixture/);
  allowed=false;
  await act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click();});
  assert.match(document.body.textContent,/Access needed/);assert.doesNotMatch(document.body.textContent,/Softball Fixture|fixture@example/);
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();globalThis.window=old.window;globalThis.document=old.document;globalThis.IS_REACT_ACT_ENVIRONMENT=old.act;delete globalThis.__registrationTestApi;await rm(temp,{recursive:true,force:true});}
});
