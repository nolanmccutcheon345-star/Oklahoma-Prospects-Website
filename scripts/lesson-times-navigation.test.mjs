import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

test('checkout finds next instructor opening, accepts a time, and Train uses the bottom popup',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/pay'});
 const previous={}; for(const key of ['window','document','HTMLElement','Node','IS_REACT_ACT_ENVIRONMENT'])previous[key]=globalThis[key];
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});
 const {act,createElement}=await import('react'); const {createRoot}=await import('react-dom/client');
 const {calculateQuote}=await import('../src/lib/commerce/contracts.ts');
 const product={id:'s1',kind:'lesson',name:'New Pitcher Assessment',price:149,minutes:75,credits:0,remote:0,expires_days:0,hours:0,discipline:'Pitching',active:true};
 const f={search:{kind:'lesson',id:'s1',instructor:'nolan'},path:'/pay',calls:[],target:'2027-01-04'};
 f.context=async()=>({products:[product],athletes:[{id:'child',name:'Test Player',assessmentComplete:false}],coaches:[{id:'nolan',name:'Test Instructor',serviceIds:['s1']}],mode:'test',square:{checkoutScope:'all'}});
 f.quote=async({data})=>{f.calls.push(data);return {quote:calculateQuote(data,product,false,[],false),slots:data.date===f.target?[{value:'16:00',label:'4:00 PM'}]:[],nextAvailable:data.date===f.target?null:{date:f.target,slots:[{value:'16:00',label:'4:00 PM'}]}}};
 globalThis.__lessonUi=f;
 const mocks={
 '@tanstack/react-router':`import {createElement} from 'react';export const Link=({to,search,children,...p})=>createElement('a',{...p,href:to+(search?'?'+new URLSearchParams(search):'')},children);export const createFileRoute=()=>o=>({...o,useSearch:()=>globalThis.__lessonUi.search});export const useRouterState=({select})=>select({location:{pathname:globalThis.__lessonUi.path}});`,
 '@/lib/auth/use-current-user':`const user={id:'parent',displayName:'Test Parent',primaryEmail:'parent@example.invalid'};export const useCurrentUser=()=>user;export const useCurrentUserState=()=>({user,isPending:false});`,
 '@/lib/commerce/api':`export const getCheckoutContext=()=>globalThis.__lessonUi.context();export const getCheckoutQuote=(...a)=>globalThis.__lessonUi.quote(...a);export const startCheckout=()=>{throw Error('No payment in this test')};export const submitSquarePayment=()=>{throw Error('No payment in this test')};`,
 '@/components/commerce/square-card':`export const SquareCard=()=>null;`,
 '@/lib/seo':`export const pageHead=()=>({});`,
 };
 const temp=await mkdtemp('scripts/.lesson-ui-');const out=temp+'/test.mjs';let root;
 try{
 await build({stdin:{contents:"export {Route} from './src/routes/pay';export {AppShell} from './src/components/app-shell';",resolveDir:process.cwd(),loader:'tsx'},outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:null);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));}}]});
 const {Route,AppShell}=await import(pathToFileURL(out).href);root=createRoot(document.getElementById('root'));
 const render=key=>act(async()=>root.render(createElement(AppShell,null,createElement(Route.component,{key}))));
 const settle=async()=>{for(let i=0;i<3;i++)await act(async()=>{await new Promise(r=>setTimeout(r,300))});};
 const button=t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);
 await render('automatic');await settle();
 assert.equal(document.querySelector('input[type="date"]').value,f.target);
 assert.match(document.body.textContent,/Showing this instructor’s next available date/);
 assert.ok(button('4:00 PM'));
 await act(async()=>button('4:00 PM').click());
 assert.equal(button('4:00 PM').getAttribute('aria-pressed'),'true');
 assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Continue to payment')).disabled,false);
 f.search={...f.search,date:'2026-10-09'};await render('manual');await settle();
 assert.equal(document.querySelector('input[type="date"]').value,'2026-10-09','explicit date is preserved');
 const next=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Show next available date'));
 assert.ok(next);await act(async()=>next.click());await settle();assert.ok(button('4:00 PM'));
 const train=button('Train'),teams=button('Teams');assert.ok(train);assert.ok(teams);
 await act(async()=>train.click());let menu=document.querySelector('[aria-label="Train submenu"]');assert.ok(menu);
 assert.deepEqual([...menu.querySelectorAll('a')].map(a=>[a.textContent,a.getAttribute('href')]),[['Lessons','/training?view=lessons'],['Instructors','/instructors'],['Training Plans','/training?view=plans']]);
 await act(async()=>teams.click());assert.equal(document.querySelector('[aria-label="Train submenu"]'),null);assert.ok(document.querySelector('[aria-label="Teams submenu"]'));
 await act(async()=>train.click());await act(async()=>document.querySelector('[aria-label="Train submenu"] a').click());assert.equal(document.querySelector('[role="menu"]'),null);
 await act(async()=>train.click());await act(async()=>window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'})));assert.equal(document.querySelector('[role="menu"]'),null);
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,previous);delete globalThis.__lessonUi;await rm(temp,{recursive:true,force:true});}
});
