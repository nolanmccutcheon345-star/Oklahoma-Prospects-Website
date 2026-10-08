import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import type {Sql} from "./db";
import {emptyDevelopment} from "./pd/empty";
import {seedDevelopment} from "./pd/seed";
test('coach profile and working-file writes roll back together on a revision conflict',async()=>{
  let injectConflict=false;
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const text=parts.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,"");
      const result=await query(text,values);
      // Simulate a revision conflict after the first write, inside the actual transaction.
      if(injectConflict&&text.includes('insert into coach_profiles')) {
        injectConflict=false;
        await query("update pd_working_file set revision=revision+1 where id='club'",[]);
      }
      return result.rows;
    }) as Sql;
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
      const {saveCoach}=await import('./coaching.server');
      const original={name:'Coach',specialties:[],career:'Original bio',approach:'',ages:'',achievements:'',welcome:'',published:false};
      await sql`insert into coach_profiles(id,user_id,profile,published) values('coach-record','coach',${JSON.stringify(original)}::jsonb,false)`;
      const changed={...original,name:'Updated Coach',career:'Updated public bio',specialties:['Hitting'],published:true};
      injectConflict=true;
      await assert.rejects(()=>saveCoach('coach',changed),/Another editor saved changes/);
      const [rolledBack]=await sql<{profile:typeof original;published:boolean}>`select profile,published from coach_profiles where user_id='coach'`;
      assert.deepEqual(rolledBack.profile,original);assert.equal(rolledBack.published,false);
      const [working]=await sql<{revision:number;payload:string}>`select revision,payload from pd_working_file where id='club'`;
      assert.equal(working.revision,7);assert.equal(JSON.parse(working.payload).coaches[0].name,'Coach');
      await saveCoach('coach',changed);
      const [saved]=await sql<{profile:typeof changed;published:boolean}>`select profile,published from coach_profiles where user_id='coach'`;
      assert.deepEqual(saved.profile,changed);assert.equal(saved.published,true);
      const [updated]=await sql<{revision:number;payload:string}>`select revision,payload from pd_working_file where id='club'`;
      assert.equal(updated.revision,8);assert.equal(JSON.parse(updated.payload).coaches[0].name,'Updated Coach');
      assert.deepEqual(JSON.parse(updated.payload).coaches[0].specialties,['Hitting']);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
