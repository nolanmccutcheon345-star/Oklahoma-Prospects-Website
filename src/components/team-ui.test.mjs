import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";

test("Bio buttons toggle independently; season picker keeps multiple choices; am/pm input submits canonical clock", async () => {
  const dom=new JSDOM('<div id="root"></div>',{url:'https://example.invalid'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const React=await import('react');
  const {createRoot}=await import('react-dom/client');
  const {CoachBio}=await import('./coach-bio.tsx');
  const {SeasonPicker}=await import('./teams/season-picker.tsx');
  const {TimeInput}=await import('./time-input.tsx');
  const host=document.getElementById('root'); const root=createRoot(host);
  let chosen=['Spring 2027'];let savedTime='';
  function App(){
    const [seasons,setSeasons]=React.useState(chosen);
    return React.createElement('div',{},
      React.createElement(CoachBio,{},'First coach biography'),React.createElement(CoachBio,{},'Second coach biography'),
      React.createElement(SeasonPicker,{label:'Team seasons',value:seasons,onChange:next=>{chosen=next;setSeasons(next);}}),
      React.createElement('form',{},React.createElement(TimeInput,{name:'startTime',defaultValue:'13:00',onChange:e=>{savedTime=e.target.value;}})));
  }
  try {
    await React.act(async()=>root.render(React.createElement(App)));
    const bios=[...host.querySelectorAll('button')];
    assert.equal(bios[0].getAttribute('aria-expanded'),'false');
    await React.act(async()=>bios[0].click());
    assert.equal(bios[0].getAttribute('aria-expanded'),'true');assert.equal(bios[1].getAttribute('aria-expanded'),'false');
    await React.act(async()=>bios[0].click());assert.equal(bios[0].getAttribute('aria-expanded'),'false');
    const summer=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('Summer 2027')).querySelector('input');
    await React.act(async()=>summer.click());assert.deepEqual(chosen,['Spring 2027','Summer 2027']);
    const clock=host.querySelector('input[type="text"]');
    assert.equal(clock.value,'1:00pm');
    const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;
    await React.act(async()=>{setter.call(clock,'2:30pm');clock.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
    assert.equal(savedTime,'14:30');
    assert.equal(new dom.window.FormData(host.querySelector('form')).get('startTime'),'14:30');
  } finally {await React.act(async()=>root.unmount());dom.window.close();}
});
