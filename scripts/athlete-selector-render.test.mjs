import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

test('athlete search retains selection, filters only supplied scope and never switches silently', async () => {
  const dom = new JSDOM('<div id="root"></div>', {url:'https://fixture.invalid'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const {act,createElement} = await import('react');
  const {createRoot} = await import('react-dom/client');
  const result = await build({entryPoints:['src/components/pd/athlete-selector.tsx'],bundle:true,platform:'node',format:'esm',write:false,external:['react','react/*']});
  await mkdir('artifacts',{recursive:true});
  const out=resolve('artifacts/athlete-selector-test.mjs');
  await writeFile(out,result.outputFiles[0].text);
  const {AthleteSelector,athleteScope}=await import(pathToFileURL(out).href);
  const root=createRoot(document.getElementById('root'));
  const athletes=Array.from({length:9},(_,i)=>({id:String(i),name:`Player ${i}`}));
  const changes=[];
  try {
    await act(async()=>root.render(createElement(AthleteSelector,{athletes,value:'0',onChange:id=>changes.push(id),scope:athleteScope('coach')})));
    assert.match(document.body.textContent,/assigned athletes/);
    const input=document.querySelector('input');
    await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Player 7');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    assert.deepEqual([...document.querySelectorAll('option')].map(o=>o.value),['','0','7']);
    assert.equal(document.querySelector('select').value,'0');
    assert.equal(changes.length,0);
    await act(async()=>{const el=document.querySelector('select');el.value='7';el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
    assert.deepEqual(changes,['7']);
    assert.equal(athleteScope('admin'),'All athletes.');
    assert.equal(athleteScope('parent'),'Athletes linked to your household.');
    assert.equal(athleteScope('player'),'Your linked player record.');
  } finally {await act(async()=>root.unmount());dom.window.close();await rm(out,{force:true});}
});
