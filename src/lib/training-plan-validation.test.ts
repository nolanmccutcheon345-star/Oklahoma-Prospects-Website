import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {randomUUID} from "node:crypto";
import type {Sql} from "./db";
import {emptyDevelopment} from "./pd/empty";
import {seedDevelopment} from "./pd/seed";
test('training plans reject ambiguous drills and invalid progression before writes',async()=>{
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));




    for(const id of ['coach','parent']) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id+'@example.invalid'},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id+'@example.invalid'},${id},${id},'family')`;
    }
    await sql`insert into club_athletes(id,user_id,household_email,name) values('athlete','parent','parent@example.invalid','Synthetic Athlete')`;
    await sql`update club_athletes set coach_ids='["coach-record"]'::jsonb where id='athlete'`;
    const full=emptyDevelopment();
    full.coaches=[{id:'coach-record',name:'Coach',email:'coach@example.invalid',active:true,specialties:[]}];
    full.families=[{id:'family',email:'parent@example.invalid',name:'Synthetic Household',parentName:'Parent',phone:'',athleteIds:['athlete'],leaderboardOptOut:true}];
    full.athletes=[{...seedDevelopment().athletes[0],id:'athlete',familyId:'family',firstName:'Synthetic',lastName:'Athlete',coachIds:['coach-record']}];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(full)},7)`;
    const state=globalThis as typeof globalThis & {__pgSqlPromise__?:Promise<Sql>};
    const oldSql=state.__pgSqlPromise__,oldUrl=process.env.DATABASE_URL,oldContext=process.env.CONTEXT;
    try {
      process.env.DATABASE_URL='postgresql://unused.invalid/disposable';process.env.CONTEXT='dev';state.__pgSqlPromise__=Promise.resolve(sql);
      const {setTrack,setTrainingDay}=await import('./coaching.server');
      const item={id:randomUUID(),name:'Tee drill',track:'Hitting' as const,sets:3,reps:'10',instructions:'Complete assigned repetitions',videoUrl:''};
      const input={athleteId:'athlete',day:'2026-01-01',focus:'Hitting practice',gameNotes:'',items:[item]};
      await assert.rejects(()=>setTrainingDay('coach',{...input,items:[item,item]}),/unique ID/);
      await assert.rejects(()=>setTrainingDay('coach',{...input,items:[{...item,sets:0}]}),/Too small/);
      await assert.rejects(()=>setTrainingDay('coach',{...input,day:'2026-02-30'}),/Invalid date/);
      await assert.rejects(()=>setTrainingDay('parent',input),/assigned coach/);
      await setTrainingDay('coach',input);
      await setTrainingDay('coach',{...input,items:[]});
      const [saved]=await sql<{items:unknown[]}>`select items from athlete_training_days where athlete_id='athlete'`;assert.deepEqual(saved.items,[]);
      const track={athleteId:'athlete',track:'Hitting' as const,level:2,evidence:'Observed assessment evidence'};
      await assert.rejects(()=>setTrack('coach',{...track,level:8}),/Too big/);
      await assert.rejects(()=>setTrack('parent',track),/assigned coach/);
      await setTrack('coach',track);
      assert.equal((await sql<{level:number}>`select level from athlete_track_progress where athlete_id='athlete'`)[0].level,2);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
