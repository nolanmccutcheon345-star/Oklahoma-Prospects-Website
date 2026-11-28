import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

async function fixture(entry, label) {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {window:dom.window, document:dom.window.document, IS_REACT_ACT_ENVIRONMENT:true});
  globalThis.rosterIdentityFixture={user:null,isPending:false,params:{teamId:"synthetic-team",rosterPlayerId:"synthetic-player"},requests:[]};
  const out=resolve(`scripts/.roster-identity-${label}.mjs`);
  const result=await build({entryPoints:[entry],bundle:true,platform:"node",format:"esm",write:false,external:["react","react/*"],plugins:[{name:"identity-fixtures",setup(b){
    b.onResolve({filter:/^@tanstack\/react-router$/},()=>({path:"router",namespace:"fixture"}));
    b.onResolve({filter:/^@\//},({path})=>({path,namespace:"fixture"}));
    b.onResolve({filter:/^\.\//},({path,importer})=>importer.endsWith("public-team-roster.tsx")?{path,namespace:"fixture"}:undefined);
    b.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({loader:"js",contents:
      path==="router" ? 'export const createFileRoute=()=>options=>({options,useParams:()=>globalThis.rosterIdentityFixture.params});' :
      path.endsWith("use-current-user") ? 'export const useCurrentUserState=()=>globalThis.rosterIdentityFixture;' :
      path.endsWith("public-api") ? 'const pending=(kind,data)=>new Promise((resolve,reject)=>globalThis.rosterIdentityFixture.requests.push({kind,data,resolve,reject})); export const getTeamPlayerStats=({data})=>pending("player",data);export const getTeamStatsAccess=({data})=>pending("access",data);export const getPublicTeamsView=async()=>[];' :
      path.endsWith("team-activities") ? 'import {createElement,useState} from "react";export function TeamActivities(){const [identity]=useState(globalThis.rosterIdentityFixture.user.id);return createElement("p",null,"private-activity-for-"+identity);}' :
      path.endsWith("public-profile-text") ? 'export const publicCoachName=x=>x;' :
      path.endsWith("public-request") ? 'export const publicRequest=x=>x;' :
      path.endsWith("public-record") ? 'export const publicRecordLabel=()=>null;' :
      path.endsWith("public-labels") ? 'export const publicTeamName=x=>x;export const sortSeasonLabels=x=>[...x];' :
      path.endsWith("club") ? 'export const CLUB={name:"Synthetic academy"};' :
      'export const StatsTable=()=>null;export const CatalogStatus=()=>null;export const Button=()=>null;export const CoachBio=()=>null;'
    }));
  }}]});
  await writeFile(out,result.outputFiles[0].text);
  const mod=await import(pathToFileURL(out).href);
  const {act,createElement}=await import("react");
  const {createRoot}=await import("react-dom/client");
  const host=document.getElementById("root"),root=createRoot(host);
  return {mod,act,createElement,host,root,f:globalThis.rosterIdentityFixture,cleanup:async()=>{await act(async()=>root.unmount());await rm(out,{force:true});dom.window.close();delete globalThis.rosterIdentityFixture;}};
}

test("player stats identities clear on logout, account/team/player change and pending; stale responses cannot restore them",async()=>{
 const h=await fixture("src/routes/teams.$teamId.players.$rosterPlayerId.tsx","player");
 const {f,act,host}=h;
 const render=()=>act(async()=>h.root.render(h.createElement(h.mod.Route.options.component)));
 const row=name=>({name,teamName:"Synthetic team",number:"7",stats:{}});
 try{
  await render();assert.equal(f.requests.length,0);
  f.user={id:"staff-a"};await render();await act(async()=>f.requests.at(-1).resolve(row("private-A")));assert.match(host.textContent,/private-A/);
  f.user=null;await render();assert.doesNotMatch(host.textContent,/private-A/);assert.match(host.textContent,/authorized staff account/);
  f.user={id:"staff-a"};await render();const staleAccount=f.requests.at(-1);
  f.user={id:"parent-b"};await render();assert.doesNotMatch(host.textContent,/private-A/);
  await act(async()=>staleAccount.resolve(row("stale-account")));assert.doesNotMatch(host.textContent,/stale-account/);
  await act(async()=>f.requests.at(-1).reject(new Error("Unauthorized")));assert.match(host.textContent,/Unauthorized/);
  f.user={id:"staff-a"};await render();await act(async()=>f.requests.at(-1).resolve(row("private-A")));
  f.isPending=true;await render();assert.doesNotMatch(host.textContent,/private-A/);
  f.isPending=false;await render();const stalePlayer=f.requests.at(-1);
  f.params={teamId:"other-team",rosterPlayerId:"other-player"};await render();
  await act(async()=>stalePlayer.resolve(row("stale-player")));assert.doesNotMatch(host.textContent,/stale-player/);
  await act(async()=>f.requests.at(-1).resolve(row("private-new")));assert.match(host.textContent,/private-new/);
  f.user={id:"dev",isDevFallback:true};await render();assert.doesNotMatch(host.textContent,/private-new/);
 }finally{await h.cleanup();}
});

test("team activity access is identity-bound through logout, account switch, pending and stale access replies",async()=>{
 const h=await fixture("src/components/public-team-roster.tsx","activity");const {f,act,host}=h;
 const initial=[{id:"synthetic-team",name:"Synthetic team",sport:"Baseball",age:"13U",seasons:["2027"],record:{w:0,l:0,t:0},stats:{},coaches:[],players:[{id:"secret",name:"private-roster-name",number:"7"}]}];
 let teamId="synthetic-team";
 const render=()=>act(async()=>h.root.render(h.createElement(h.mod.PublicTeamRoster,{initial,teamId})));
 try{
  await render();assert.equal(f.requests.length,0);assert.doesNotMatch(host.textContent,/private-roster-name/);
  f.user={id:"staff-a"};await render();await act(async()=>f.requests.at(-1).resolve({allowed:true}));assert.match(host.textContent,/private-activity-for-staff-a/);
  f.user={id:"parent-b"};await render();assert.doesNotMatch(host.textContent,/private-activity-for-staff-a/);
  await act(async()=>f.requests.at(-1).resolve({allowed:true}));assert.match(host.textContent,/private-activity-for-parent-b/);
  f.user=null;await render();assert.doesNotMatch(host.textContent,/private-activity/);
  f.user={id:"staff-a"};await render();const stale=f.requests.at(-1);
  f.user={id:"unrelated"};await render();await act(async()=>stale.resolve({allowed:true}));assert.doesNotMatch(host.textContent,/private-activity/);
  await act(async()=>f.requests.at(-1).resolve({allowed:false}));assert.doesNotMatch(host.textContent,/private-activity/);
  f.user={id:"staff-a"};await render();await act(async()=>f.requests.at(-1).resolve({allowed:true}));
  f.isPending=true;await render();assert.doesNotMatch(host.textContent,/private-activity/);
  f.isPending=false;await render();const staleTeam=f.requests.at(-1);teamId="other-team";await render();
  await act(async()=>staleTeam.resolve({allowed:true}));assert.doesNotMatch(host.textContent,/private-activity/);
 }finally{await h.cleanup();}
});
