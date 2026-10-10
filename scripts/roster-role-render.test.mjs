import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
test('roster selector exposes PO only for the selected enabled team and refreshes after budget saves',async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 globalThis.rosterFixture={teams:[{id:'on',poEnabled:true},{id:'off',poEnabled:false}]};
 const out=resolve('scripts/.roster-role-test.mjs');
 const built=await build({entryPoints:['src/components/teams/roster-role-select.tsx'],bundle:true,platform:'node',format:'esm',write:false,external:['react','react/*'],plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@\/lib\/teams\/fee-api$/},()=>({path:'api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getFeeWorkspace=async()=>globalThis.rosterFixture;',loader:'js'}));}}]});
 await writeFile(out,built.outputFiles[0].text);
 const {RosterRoleSelect}=await import(pathToFileURL(out).href);
 const {act,createElement}=await import('react');const {createRoot}=await import('react-dom/client');
 const host=document.getElementById('root'),root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(RosterRoleSelect,{teamId:'on',defaultValue:'po'})));
  assert.equal(host.querySelector('select').value,'po');
  await act(async()=>root.render(createElement(RosterRoleSelect,{teamId:'off',defaultValue:'po'})));
  assert.equal(host.querySelector('option[value=po]'),null);
  assert.equal(host.querySelector('select').value,'');
  globalThis.rosterFixture.teams[1].poEnabled=true;
  await act(async()=>window.dispatchEvent(new dom.window.Event('team-budget-updated')));
  assert.ok(host.querySelector('option[value=po]'));
 }finally{await act(async()=>root.unmount());await rm(out,{force:true});dom.window.close();delete globalThis.rosterFixture;}
});
