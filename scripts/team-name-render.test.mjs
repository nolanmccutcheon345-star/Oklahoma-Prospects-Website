import test from 'node:test';
import assert from 'node:assert/strict';
import { withRendered } from './render-component-support.mjs';

test('rename preserves existing record, handles failure/retry, and cancels without writes', async () => {
 const team={id:'8u',name:'Prospect Navy 8U',roster:[{id:'p'}],budget:{fee:850}};
 const club={_rev:4,teams:[team,{id:'other',name:'Other'}],catalog:[]};
 const calls=[];let succeed=false;
 await withRendered('src/components/teams/team-name-editor.tsx','TeamNameEditor',{club,teamId:'8u',onSave:async next=>{calls.push(next);return succeed;}},{},async({host,act,dom})=>{
  const input=host.querySelector('input');
  const fill=async text=>act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,text);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await fill('Prospects 8U');
  await act(async()=>host.querySelector('button[type="button"]').click());
  assert.equal(input.value,team.name);assert.equal(calls.length,0);
  await fill('Prospects 8U');
  await act(async()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.match(host.textContent,/not saved/);assert.equal(input.value,'Prospects 8U');
  succeed=true;
  await act(async()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
  assert.match(host.textContent,/Team name saved/);assert.equal(calls.length,2);
  assert.deepEqual(calls[1],{...club,teams:[{...team,name:'Prospects 8U'},club.teams[1]]});
  assert.equal(team.name,'Prospect Navy 8U');
 });
});

test('rename prevents duplicate submissions while saving', async () => {
 const club={_rev:1,teams:[{id:'8u',name:'Old',roster:[]}],catalog:[]};
 let finish,calls=0;
 await withRendered('src/components/teams/team-name-editor.tsx','TeamNameEditor',{club,teamId:'8u',onSave:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}},{},async({host,act,dom})=>{
  const input=host.querySelector('input');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Prospects 8U');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
  await act(async()=>{for(let i=0;i<2;i++)host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(calls,1);assert.equal(input.disabled,true);
  await act(async()=>finish(true));
  assert.equal(input.disabled,false);assert.match(host.textContent,/Team name saved/);
 });
});
