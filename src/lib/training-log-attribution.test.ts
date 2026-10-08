import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {randomUUID} from "node:crypto";
import type {Sql} from "./db";
import {emptyDevelopment} from "./pd/empty";
import {seedDevelopment} from "./pd/seed";
test('training log edits validate assigned drills and retain the latest writer identity',async()=>{
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
      const {setTrainingDay,logTraining}=await import('./coaching.server');
      const item={id:randomUUID(),name:'Tee drill',track:'Hitting' as const,sets:3,reps:'10',instructions:'Complete assigned repetitions',videoUrl:''};
      const plan={athleteId:'athlete',day:'2026-01-01',focus:'Hitting practice',gameNotes:'',items:[item]};
      await setTrainingDay('coach',plan);
      const log={athleteId:'athlete',day:plan.day,itemId:item.id,completed:true,reps:10,notes:'Athlete completed reps'};
      await logTraining('parent',log);
      await logTraining('coach',{...log,reps:12,notes:'Coach corrected reps'});
      const [saved]=await sql<{user_id:string;reps:number;notes:string}>`select user_id,reps,notes from athlete_training_logs where athlete_id='athlete'`;
      assert.deepEqual(saved,{user_id:'coach',reps:12,notes:'Coach corrected reps'});
      await assert.rejects(()=>logTraining('parent',{...log,reps:-1}),/Too small/);
      await assert.rejects(()=>logTraining('parent',{...log,itemId:randomUUID()}),/not on the assigned plan/);
      await assert.rejects(()=>logTraining('parent',{...log,athleteId:'unrelated'}),/Forbidden/);
      await assert.rejects(()=>logTraining('parent',{...log,day:'2026-02-30'}),/Invalid date/);
      assert.equal((await sql`select user_id from athlete_training_logs`).length,1);
      assert.equal((await sql<{user_id:string}>`select user_id from athlete_training_logs`)[0].user_id,'coach');
      await logTraining('parent',log);
      assert.equal((await sql<{user_id:string}>`select user_id from athlete_training_logs`)[0].user_id,'parent');
      await setTrainingDay('coach',{...plan,items:[]});
      await assert.rejects(()=>logTraining('parent',{...log,reps:99}),/not on the assigned plan/);
      assert.equal((await sql<{reps:number}>`select reps from athlete_training_logs`)[0].reps,10);
      await setTrainingDay('coach',plan);
      await logTraining('coach',{...log,reps:15});
      assert.equal((await sql<{reps:number}>`select reps from athlete_training_logs`)[0].reps,15);
      const {chicagoDate}=await import('./scheduling');
      const future={...plan,day:'2099-01-01'};
      await setTrainingDay('coach',future);
      await assert.rejects(()=>logTraining('parent',{...log,day:future.day}),/cannot be dated in the future/);
      const today={...plan,day:chicagoDate()};
      await setTrainingDay('coach',today);
      await logTraining('parent',{...log,day:today.day});
      assert.equal((await sql`select day from athlete_training_logs`).length,2);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
