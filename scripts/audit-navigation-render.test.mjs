import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {buildPublicCatalog} from '../src/lib/ops.ts';
import {approvedProducts} from '../src/lib/commerce/catalog.ts';

// Real components and catalog. Only router/auth/network boundaries are isolated.
// This verifies markup and interactions, not browser CSS geometry.
test('public navigation, sport links and purchase availability agree with the live launch scope',async()=>{
 const temp=await mkdtemp('scripts/.audit-ui-'),outfile=temp+'/navigation.mjs';
 const dom=new JSDOM('<div id="root"></div>',{url:'https://audit.example.invalid/training'});
 const old={window:globalThis.window,document:globalThis.document,act:globalThis.IS_REACT_ACT_ENVIRONMENT,fetch:globalThis.fetch};
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const state={catalog:{...buildPublicCatalog([]),purchaseAvailability:{ready:true,scope:'cages'}},path:'/training',navigate:null};
 globalThis.__auditNav=state;let root;
 globalThis.fetch=async url=>{assert.ok(String(url).startsWith("/api/fundraising/teams"));return Response.json({teams:[]});};
 try{
  await build({stdin:{contents:`export {AppShell} from './src/components/app-shell';export {Route as Training} from './src/routes/training';export {Route as Teams} from './src/routes/teams';`,resolveDir:process.cwd(),loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'ui-boundaries',setup(b){
   b.onResolve({filter:/^@tanstack\/react-router$/},()=>({path:'router',namespace:'audit-nav'}));
   b.onResolve({filter:/use-current-user$/},()=>({path:'user',namespace:'audit-nav'}));
   b.onResolve({filter:/auth\/gates$/},()=>({path:'gates',namespace:'audit-nav'}));
   b.onResolve({filter:/use-catalog$/},()=>({path:'catalog',namespace:'audit-nav'}));
   b.onLoad({filter:/.*/,namespace:'audit-nav'},a=>({loader:'js',resolveDir:process.cwd(),contents:{
    router:`import {createElement} from 'react';export const Link=({to,search,hash,children,...props})=>createElement('a',{...props,href:to+(search?'?'+new URLSearchParams(search):'')+(hash?'#'+hash:'')},children);export const Outlet=()=>null;export const createFileRoute=()=>options=>({...options,useSearch:()=>({})});export const useNavigate=()=>value=>{globalThis.__auditNav.navigate=value;return Promise.resolve();};export const useRouterState=({select})=>select({location:{pathname:globalThis.__auditNav.path}});`,
    user:'export const useCurrentUser=()=>null;export const useCurrentUserState=()=>({user:null,isPending:false});',
    gates:'export const SignedIn=()=>null;export const SignedOut=({children})=>children;',
    catalog:'export const useLiveCatalog=()=>globalThis.__auditNav.catalog;',
   }[a.path]}));
  }}]});
  const ui=await import(pathToFileURL(process.cwd()+'/'+outfile));root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Training.component))));
  const primary=[...document.querySelectorAll('nav[aria-label="Primary"] a')];
  assert.deepEqual(primary.map(a=>a.textContent),['Home','Train','Teams','Book']);
  assert.equal(primary[1].getAttribute('aria-current'),'page');
  assert.ok(document.querySelector('footer a[href*="prospects-live"]'));
  assert.ok(document.querySelector('footer a[href="/contact"]'));
  assert.equal(document.querySelectorAll('a[href^="/pay"]').length,0);
  assert.match(document.body.textContent,/Lesson enrollment by inquiry/);
  assert.match(document.querySelector('#youth-lessons').textContent,/ages 10 and under/);
  const service=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('New Pitcher Assessment'));
  await act(async()=>service.click());assert.deepEqual(state.navigate,{to:'/contact',search:{subject:'New Pitcher Assessment'}});
  const remote=[...document.querySelectorAll('article')].find(a=>a.textContent.includes('Remote HS Pitching'));
  assert.match(remote.textContent,/completed assessment is required/);assert.doesNotMatch(remote.textContent,/First month/);
  state.path='/teams';
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Teams.component))));
  assert.deepEqual([...document.querySelectorAll('nav[aria-label="Team sports"] a')].map(a=>a.textContent),['Baseball','Softball']);
  for(const anchor of document.querySelectorAll('nav[aria-label="Team sports"] a')) assert.ok(document.querySelector(anchor.getAttribute('href')));
  assert.ok(document.querySelector('a[href*="sport=Softball"][href*="age=12U"]'));
  const stored={id:'s1',kind:'lesson',name:'Assessment',discipline:'Pitching',price:155,minutes:75,active:true,includes:[],perks:[]};
  assert.equal(buildPublicCatalog([stored]).lessons[0].price,approvedProducts([stored])[0].price);
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();globalThis.window=old.window;globalThis.document=old.document;globalThis.IS_REACT_ACT_ENVIRONMENT=old.act;globalThis.fetch=old.fetch;delete globalThis.__auditNav;await rm(temp,{recursive:true,force:true});}
});
