import {catalogFixture} from "../src/lib/testing/catalog-fixture.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
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
 const state={catalog:{...await catalogFixture(),purchaseAvailability:{ready:true,scope:'cages'}},path:'/training',navigate:null,events:[],gameRows:[],user:null,checkoutAthletes:[]};
 globalThis.__auditNav=state;let root;
 globalThis.fetch=async url=>{assert.ok(String(url).startsWith("/api/fundraising/teams"));return Response.json({teams:[]});};
 try{
  await build({stdin:{contents:`export {AppShell} from './src/components/app-shell';export {Route as Training} from './src/routes/training';export {Route as Teams} from './src/routes/teams';export {Route as Home} from './src/routes/index';export {Route as Games} from './src/routes/games';`,resolveDir:process.cwd(),loader:'tsx'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'ui-boundaries',setup(b){
   b.onResolve({filter:/^@tanstack\/react-router$/},()=>({path:'router',namespace:'audit-nav'}));
   b.onResolve({filter:/use-current-user$/},()=>({path:'user',namespace:'audit-nav'}));
   b.onResolve({filter:/auth\/gates$/},()=>({path:'gates',namespace:'audit-nav'}));
   b.onResolve({filter:/use-catalog$/},()=>({path:'catalog',namespace:'audit-nav'}));
   b.onResolve({filter:/commerce\/api$/},()=>({path:'checkout',namespace:'audit-nav'}));
    b.onResolve({filter:/games-api$/},()=>({path:'games-api',namespace:'audit-nav'}));
   b.onLoad({filter:/.*/,namespace:'audit-nav'},a=>({loader:'js',resolveDir:process.cwd(),contents:{
    router:`import {createElement} from 'react';export const Link=({to,search,hash,children,...props})=>createElement('a',{...props,href:to+(search?'?'+new URLSearchParams(search):'')+(hash?'#'+hash:'')},children);export const Outlet=()=>null;export const createFileRoute=()=>options=>({...options,useSearch:()=>({view:'watch',game:undefined}),useLoaderData:()=>globalThis.__auditNav.path==='/games'?{games:globalThis.__auditNav.gameRows,loaded:true}:globalThis.__auditNav.events});export const useNavigate=()=>value=>{globalThis.__auditNav.navigate=value;return Promise.resolve();};export const useRouterState=({select})=>select({location:{pathname:globalThis.__auditNav.path}});`,
    user:'export const useCurrentUser=()=>globalThis.__auditNav.user;export const useCurrentUserState=()=>({user:globalThis.__auditNav.user,isPending:false});',
    gates:'export const SignedIn=({children})=>globalThis.__auditNav.user?children:null;export const SignedOut=({children})=>globalThis.__auditNav.user?null:children;',
    checkout:'export const getCheckoutContext=async()=>({athletes:globalThis.__auditNav.checkoutAthletes});',
    catalog:'export const useLiveCatalog=()=>globalThis.__auditNav.catalog;',
     'games-api':'export const getPublicGames=async()=>[];export const getAdminGames=async()=>[];export const saveGame=async()=>{throw new Error("Owner only")};',
   }[a.path]}));
  }}]});
  const ui=await import(pathToFileURL(process.cwd()+'/'+outfile));root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Training.component))));
  const primary=[...document.querySelectorAll('nav[aria-label="Primary"] ul > li > a, nav[aria-label="Primary"] ul > li > button')];
  assert.deepEqual(primary.map(a=>a.textContent?.trim()),['Home','Train','Teams','Book','Games','Shop']);
  assert.equal(primary.length,6);
  assert.equal(document.querySelector('nav[aria-label="Primary"] ul')?.className.includes('grid-cols-6'),true);
  assert.equal(primary[1].getAttribute('aria-current'),'page');
  assert.equal(primary[4].getAttribute('href'),'/games');
  assert.equal(primary[5].getAttribute('href'),'/merchandise');
  assert.equal(primary[2].getAttribute('aria-expanded'),'false');
  assert.equal(document.querySelector('footer a[href^="/games"]')?.textContent,'Games');
  assert.equal(document.querySelector('footer a[href*="prospects-live"]'),null);
  assert.equal(document.querySelector('a[href*="chatgpt.site"]'),null);
  assert.match(document.querySelector('header')?.textContent??'',/Prospects Sports Academy/);
  assert.doesNotMatch(document.querySelector('header')?.textContent??'',/Oklahoma Prospects Academy/);
  const wordmark=document.querySelector('[data-club-wordmark]');
  assert.equal(wordmark?.textContent?.replace(/\s+/g,' ').trim(),'Prospects Sports Academy');
  assert.deepEqual([...wordmark.querySelectorAll('.club-wordmark-line')].map(node=>node.textContent.replace(/\s+/g,' ').trim()),['Prospects Sports','Academy']);
  assert.doesNotMatch(document.querySelector('header')?.innerHTML??'',/truncate|text-ellipsis|ellipsis/);
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.club-wordmark\s*\{[^}]*overflow:\s*visible;[^}]*text-overflow:\s*clip;/);
  const narrow=css.slice(css.lastIndexOf('@media (max-width: 360px)'));
  assert.match(narrow,/font-size:\s*0\.94rem/);
  assert.match(narrow,/white-space:\s*nowrap/);
  assert.match(narrow,/\.club-wordmark-line \{ display: block; white-space: nowrap; \}/);
  assert.match(narrow,/\.club-wordmark-gap \{ display: none; \}/);
  assert.match(wordmark.className,/max-\[360px\]:text-\[0\.94rem\]/);
  assert.match(wordmark.className,/max-\[360px\]:whitespace-nowrap/);
  const auth=document.querySelector('header a[href^="/login"]');
  assert.match(auth?.className??'',/min-w-24/);
  assert.match(auth?.className??'',/whitespace-nowrap/);
  assert.match(document.querySelector('header')?.innerHTML??'',/whitespace-nowrap">Est\./);
  for(const link of primary) assert.match(link.className,/focus-visible:outline-offset-\[-3px\]/);
  assert.ok(document.querySelector('footer a[href="/contact"]'));
  assert.equal(document.querySelectorAll('a[href^="/pay"]').length,0);
  assert.match(document.body.textContent,/Online lesson checkout temporarily unavailable/);
  assert.match(document.body.textContent,/Start with an assessment/);
  assert.match(document.body.textContent,/first included session is the assessment/i);
  assert.doesNotMatch(document.querySelector('#main').textContent,/Ask about|OP-[1-7]/i);
  assert.ok(document.querySelectorAll('#memberships article').length > 0);
  assert.match(document.querySelector('#youth-lessons').textContent,/ages 10 and under/);
  const service=[...document.querySelectorAll('#assessments button')].find(b=>b.textContent.includes('New Pitcher Assessment'));
  assert.ok(service);
  assert.equal(service.disabled,true,"Unverified checkout and no athlete must not be clickable");
  await act(async()=>service.click());assert.equal(state.navigate,null);
  const remote=[...document.querySelectorAll('article')].find(a=>a.textContent.includes('Remote HS Pitching'));
  assert.ok(remote,"Development plans remain visible while remote checkout is gated");
  assert.match(document.querySelector('#memberships').textContent,/one-time \$50 (?:assessment |first-month )?fee/i);
  state.path='/teams';
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Teams.component))));
  assert.equal(document.querySelector('nav[aria-label="Team sports"]'), null, 'No duplicate sports navbar above Teams');
  await act(async()=>primary[2].click());
  assert.equal(primary[2].getAttribute('aria-expanded'),'true');
  assert.deepEqual([...document.querySelectorAll('[aria-label="Teams submenu"] a')].map(a=>a.textContent),['Baseball','Softball','Coaches','Tryouts']);
  const choices=[...document.querySelectorAll('[aria-label="Teams submenu"] a')];
  assert.deepEqual(choices.map(a=>a.getAttribute('href')),['/baseball','/softball','/coaches','/tryouts']);
  await act(async()=>choices[2].click());
  assert.equal(primary[2].getAttribute('aria-expanded'),'false');
  assert.equal(document.querySelector('a[href*="sport=Softball"][href*="age="]'),null);
  assert.equal(document.querySelector('#softball a[href="/tryouts?sport=Softball#register"]')?.textContent,'Tryouts');
  assert.doesNotMatch(document.querySelector('#softball').textContent,/Rusty|14U B|Teams forming|Sarah Blankenship/);
  assert.match(document.querySelector('#baseball').textContent,/No baseball tryout date is currently posted/);
  assert.match(document.querySelector('#softball').textContent,/No softball tryout date is currently posted/);
  state.events=[
    {id:'test-baseball',sport:'Baseball',season:'Spring 2027',ageGroups:['15U'],date:'2026-12-12',startTime:'10:00',endTime:'12:00',location:'Prospects field',capacity:24,status:'published',revision:0},
    {id:'test-softball',sport:'Softball',season:'Spring 2027',ageGroups:['12U'],date:'2026-12-13',startTime:'13:00',endTime:'15:00',location:'Prospects cages',capacity:18,status:'published',revision:0},
  ];
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Teams.component))));
  assert.match(document.querySelector('#baseball').textContent,/December 12, 2026/);
  assert.match(document.querySelector('#softball').textContent,/December 13, 2026/);
  assert.doesNotMatch(document.querySelector('#baseball').textContent,/No baseball tryout date is currently posted/);
  assert.doesNotMatch(document.querySelector('#softball').textContent,/No softball tryout date is currently posted/);
  const stored={id:'s1',kind:'lesson',name:'Assessment',discipline:'Pitching',price:155,minutes:75,active:true,includes:[],perks:[]};
  assert.equal(buildPublicCatalog([stored]).lessons[0].price,approvedProducts([stored])[0].price);
  state.path='/';
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Home.component))));
  const tryoutLabels=[...document.querySelectorAll('a')].filter(a=>a.textContent.trim()==='Tryouts' && a.getAttribute('href')==='/tryouts');
  assert.equal(tryoutLabels.length,1);
  assert.equal([...document.querySelectorAll('a')].some(a=>/Softball teams & tryouts|Free Spring tryout|Prospects Live/.test(a.textContent)),false);
  assert.equal(document.querySelector('a[href*="chatgpt.site"], a[aria-label*="Prospects Live"]'),null);
  assert.doesNotMatch(document.body.textContent,/Tryouts is for baseball and softball/);
  assert.doesNotMatch(document.body.textContent,/Free · request a tryout|Earn a roster spot/);
  assert.equal([...document.querySelectorAll('a[href="/tryouts"]')].length,1);
  const listing=document.querySelector('a[href*="Oklahoma+Prospects+Academy"]');
  assert.match(listing?.textContent??'',/Prospects Sports Academy/);
  assert.match(document.body.textContent,/Leave a Google review/);
  assert.match(document.body.textContent,/Prospects Sports Facility/);
  state.path='/training';state.catalog.purchaseAvailability={ready:true,scope:'all'};
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Training.component))));
  assert.ok(document.querySelector('a[href="/pay?kind=membership&id=m1"]'),'Signed-out families have a real enrollment link');
  assert.ok(document.querySelector('a[href="/pay?kind=lesson&id=s1"]'),'Signed-out families can start assessment checkout');
  assert.doesNotMatch(document.querySelector('#main').textContent,/Enrollment temporarily unavailable/);
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  assert.deepEqual(tabs.map(t=>t.textContent),['Pitching','Hitting','Catching','Fielding']);
  assert.equal(document.querySelectorAll('[role="tabpanel"]:not([hidden])').length,1);
  await act(async()=>tabs[1].click());
  assert.equal(tabs[1].getAttribute('aria-selected'),'true');
  assert.equal(document.querySelector('#lesson-pitching').hidden,true);
  assert.equal(document.querySelector('#lesson-hitting').hidden,false);
  await act(async()=>tabs[1].dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  assert.equal(document.querySelector('#tab-catching').getAttribute('aria-selected'),'true');
  assert.equal(document.activeElement.id,'tab-catching');
  assert.ok(document.querySelector('#lesson-catching a[href="#assessments"]'),'Unassessed visitors get an assessment action');
  assert.equal(document.querySelector('#lesson-catching a[href^="/pay"]'),null,'Private lessons never bypass assessment');
  assert.equal(document.querySelectorAll('#memberships > section[aria-label="In-Person Training"] article').length,3);
  assert.equal(document.querySelectorAll('#memberships > section[aria-label="Small-Group Training"] article').length,1);
  assert.equal(document.querySelectorAll('#memberships > section[aria-label="Remote Coaching"] article').length,1);
  assert.ok([...document.querySelectorAll('#memberships summary')].some(n=>n.textContent==='Plan Details'));
  state.user={id:'audit-parent'};state.checkoutAthletes=[{id:'assessed',name:'Assessed athlete',assessmentComplete:true},{id:'sibling',name:'Sibling',assessmentComplete:false}];
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Training.component))));
  const athlete=document.querySelector('#lesson-booking select');assert.ok(athlete);
  await act(async()=>{athlete.value='assessed';athlete.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.ok(document.querySelector('#lesson-catching a[href="/pay?kind=lesson&id=s10"]'),'Assessed athlete can view lesson times');
  assert.equal(document.querySelector('[data-first-month-assessment="m1"]'),null);
  assert.ok(document.querySelector('a[href="/pay?kind=membership&id=m5"]'),'Assessed athlete can enroll in remote coaching');
  await act(async()=>{athlete.value='sibling';athlete.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.equal(document.querySelector('#lesson-catching a[href^="/pay"]'),null,'Sibling must not inherit completed assessment');
  assert.match(document.querySelector('[data-first-month-assessment="m1"]').textContent,/\$297\.00/);
  assert.equal(document.querySelector('a[href="/pay?kind=membership&id=m5"]'),null);
  assert.equal(document.querySelector('a[href="/pay?kind=membership&id=m4"]'),null,'Unpublished group enrollment stays closed');
  state.user=null;
  state.path='/games';
  await act(async()=>root.render(createElement(ui.AppShell,null,createElement(ui.Games.component))));
  assert.equal(document.querySelector('nav[aria-label="Primary"] a[href="/games"]')?.getAttribute('aria-current'),'page');
  const games=document.querySelector('#main');
  assert.match(games?.querySelector('h1')?.textContent??'',/^Games/);
  assert.match(games?.textContent??'',/Watch.*Schedule.*Scores.*Replays.*Teams/);
  assert.match(games?.textContent??'',/Nothing published here yet/);
  assert.match(games?.textContent??'',/Coach Steve's Prospects Live concept/);
  assert.equal(games?.querySelector('iframe'),null);
  assert.equal(games?.querySelector('a[href*="chatgpt.site"]'),null);
  assert.equal([...games.querySelectorAll('a')].every(a=>!String(a.getAttribute('href')).startsWith('http')),true);
 }finally{if(root)await act(async()=>root.unmount());dom.window.close();globalThis.window=old.window;globalThis.document=old.document;globalThis.IS_REACT_ACT_ENVIRONMENT=old.act;globalThis.fetch=old.fetch;delete globalThis.__auditNav;await rm(temp,{recursive:true,force:true});}
});
