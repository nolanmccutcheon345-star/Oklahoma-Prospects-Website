import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile,readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { adminGamesFor, publicGamesFor, saveGameFor, publicGameView } from "./games.server";
import { gameEventInput,videoEmbedUrl, type GameEventInput } from "./games-contracts";

const base = ():GameEventInput=>({
 id:"",revision:0,sport:"Baseball",ageGroup:"15U",teamName:"Prospects 15U",
 opponent:"Visiting team",date:"2030-05-21",startTime:"19:00",venue:"A verified field",
 status:"scheduled",ourRuns:0,oppRuns:0,inning:"",videoId:"",videoKind:"none",
 mediaApproved:false,published:false,
});
function wrap(query:PGlite["query"],db:PGlite):Sql {
 const sql=(async(parts:TemplateStringsArray,...values:unknown[])=>
  (await query(parts.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values)).rows) as Sql;
 sql.query=(async(text:string,params:unknown[]=[])=> (await query(text,params)).rows) as Sql["query"];
 sql.transaction=(work)=>db.transaction(tx=>work(wrap(tx.query.bind(tx) as PGlite["query"],db)));
 return sql;
}
test("Games publication is owner-only, audited and never leaks private media without approval",async()=>{
 const db=new PGlite();
 try{
  for(const name of (await readdir("migrations")).filter(n=>n.endsWith(".sql")).sort())
   await db.exec(await readFile("migrations/"+name,"utf8"));
  const sql=wrap(db.query.bind(db),db);
  for(const name of ["owner","parent","coach","player","fake-admin","disabled","unverified"]){
   await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt","disabledAt")
     values(${name},${name+"@example.invalid"},${name},${name!=="unverified"},now(),now(),${name==="disabled"?"2026-10-01":null})`;
   await sql`insert into profiles(user_id,email,name,role,family_id)
     values(${name},${name+"@example.invalid"},${name},${["owner","fake-admin"].includes(name)?"admin":["coach","player"].includes(name)?name:"parent"},${"fam-"+name})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  for(const name of ["parent","coach","player","fake-admin","disabled","unverified","unknown"]){
   await assert.rejects(()=>adminGamesFor(sql,name));
   await assert.rejects(()=>saveGameFor(sql,name,base()));
  }
  assert.deepEqual(await publicGamesFor(sql),[]);
  const created=await saveGameFor(sql,"owner",base());
  assert.match(created.id,/^[a-f0-9-]{36}$/);
  assert.deepEqual(await publicGamesFor(sql),[],"New games are private by default");
  const [privateRow]=await adminGamesFor(sql,"owner");
  assert.equal(privateRow.revision,1);
  assert.equal(privateRow.published,false);
  await saveGameFor(sql,"owner",{...privateRow,published:true});
  const publicFeed=await publicGamesFor(sql);
  assert.equal(publicFeed.length,1);
  assert.deepEqual(Object.keys(publicFeed[0]).sort(),[
   "ageGroup","date","id","inning","oppRuns","opponent","ourRuns","revision",
   "sport","startTime","status","teamName","venue","videoId","videoKind",
  ].sort());
  assert.equal(JSON.stringify(publicFeed).includes("mediaApproved"),false);
  assert.equal(JSON.stringify(publicFeed).includes("published"),false);
  assert.equal(JSON.stringify(publicFeed).includes("updated_by"),false);
  await assert.rejects(()=>saveGameFor(sql,"owner",{...privateRow,published:true}),/Another editor/);
  const [afterPublished]=await adminGamesFor(sql,"owner");
  const updated=await saveGameFor(sql,"owner",{...afterPublished,status:"live",ourRuns:3,oppRuns:2,inning:"Bottom 4"});
  assert.deepEqual(updated,{id:created.id,ok:true});
  const [live]=await publicGamesFor(sql);
  assert.equal(live.status,"live");assert.equal(live.ourRuns,3);assert.equal(live.oppRuns,2);
  assert.equal(live.inning,"Bottom 4");
  const vid="aB0_cDE-f12";
  assert.equal(vid.length,11);
  const [current]=await adminGamesFor(sql,"owner");
  await saveGameFor(sql,"owner",{...current,status:"final",videoId:vid,videoKind:"replay",mediaApproved:false,published:false});
  assert.deepEqual(await publicGamesFor(sql),[],"Unpublished game edits are invisible to visitors");
  const [beforeRelease]=await adminGamesFor(sql,"owner");
  await assert.rejects(()=>saveGameFor(sql,"owner",{...beforeRelease,published:true}),/media publishing approvals/i);
  await saveGameFor(sql,"owner",{...beforeRelease,published:true,mediaApproved:true});
  const [replay]=await publicGamesFor(sql);
  assert.equal(replay.videoId,vid);
  assert.equal(replay.videoKind,"replay");
  assert.equal(replay.status,"final");
  assert.ok((await sql`select id from audit_events where target_table='games_events'`).length>=4);
  // A changed published media ID MUST be re-approved.
  const [approved]=await adminGamesFor(sql,"owner");
  const changedId="NopQ1234_Ab";
  assert.equal(changedId.length,11);
  await assert.rejects(()=>saveGameFor(sql,"owner",{...approved,videoId:changedId,mediaApproved:false}),/media publishing approvals/i);
  await saveGameFor(sql,"owner",{...approved,published:false,videoId:changedId,mediaApproved:false});
  assert.deepEqual(await publicGamesFor(sql),[]);
 }finally{await db.close();}
});
test("Games rejects invalid schedules, misleading draft-public combinations and arbitrary video origins",()=>{
 for(const change of [
  {date:"2030-02-30"},{startTime:"27:00"},{status:"draft",published:true},
  {videoId:"https://youtube.com/watch?v=aB0_cDE-f12",videoKind:"replay"},
  {videoId:"aB0_cDE-f12",videoKind:"none"},
  {videoId:"aB0_cDE-f12",videoKind:"replay",published:true},
  {ourRuns:-1},{oppRuns:1000},{teamName:""},{revision:-1},
 ]){
  assert.equal(gameEventInput.safeParse({...base(),...change}).success,false,JSON.stringify(change));
 }
 assert.equal(videoEmbedUrl("aB0_cDE-f12"),"https://www.youtube-nocookie.com/embed/aB0_cDE-f12");
 assert.throws(()=>videoEmbedUrl("https://evil.example"));
 const src=publicGameView({...base(),id:randomUUID(),revision:1,videoId:"aB0_cDE-f12",videoKind:"replay",mediaApproved:false,published:true});
 assert.equal(src.videoId,"");assert.equal(src.videoKind,"none");
});
