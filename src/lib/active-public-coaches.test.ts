import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import type {Sql} from "./db";
import {emptyDevelopment} from "./pd/empty";
import {seedDevelopment} from "./pd/seed";
test('public coach profiles require an active working-file coach and publication',async()=>{
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
    full.coaches=[{id:'coach-record',name:'Coach',email:'coach@example.invalid',active:true,specialties:[]},{id:'inactive',name:'Inactive',email:'inactive@example.invalid',active:false,specialties:[]}];
    full.families=[{id:'family',email:'parent@example.invalid',name:'Synthetic Household',parentName:'Parent',phone:'',athleteIds:['athlete'],leaderboardOptOut:true}];
    full.athletes=[{...seedDevelopment().athletes[0],id:'athlete',familyId:'family',firstName:'Synthetic',lastName:'Athlete',coachIds:['coach-record']}];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(full)},7)`;
    const state=globalThis as typeof globalThis & {__pgSqlPromise__?:Promise<Sql>};
    const oldSql=state.__pgSqlPromise__,oldUrl=process.env.DATABASE_URL,oldContext=process.env.CONTEXT;
    try {
      process.env.DATABASE_URL='postgresql://unused.invalid/disposable';process.env.CONTEXT='dev';state.__pgSqlPromise__=Promise.resolve(sql);
      const {publicCoaches}=await import('./coaching.server');
      const profile={name:'Public coach',specialties:['Hitting'],career:'Short public bio',approach:'',ages:'',achievements:'',welcome:'',email:'private@example.invalid',internalNotes:'Private notes'};
      for(const id of ['coach-record','inactive','orphan'])
        await sql`insert into coach_profiles(id,user_id,profile,published) values(${id},${'account-'+id},${JSON.stringify(profile)}::jsonb,true)`;
      const published=await publicCoaches();
      assert.deepEqual(published.map(c=>c.id),['coach-record']);
      assert.ok(!JSON.stringify(published).includes('private@example.invalid'));
      assert.ok(!JSON.stringify(published).includes('Private notes'));
      full.coaches[0].active=false;
      await sql`update pd_working_file set payload=${JSON.stringify(full)} where id='club'`;
      assert.deepEqual(await publicCoaches(),[]);
      full.coaches[0].active=true;
      await sql`update pd_working_file set payload=${JSON.stringify(full)} where id='club'`;
      await sql`update coach_profiles set published=false where id='coach-record'`;
      assert.deepEqual(await publicCoaches(),[]);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
