import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { emptyDevelopment } from "./pd/empty";
test('inactive coaches cannot open or edit their coaching profile and availability',async()=>{
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



    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('coach','coach@example.invalid','Coach',true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values('coach','coach@example.invalid','Coach','coach','family')`;
    const full=emptyDevelopment();full.coaches=[{id:'coach-record',name:'Coach',email:'coach@example.invalid',active:false,specialties:[]}];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(full)},7)`;
    const state=globalThis as typeof globalThis & {__pgSqlPromise__?:Promise<Sql>};
    const oldSql=state.__pgSqlPromise__,oldUrl=process.env.DATABASE_URL,oldContext=process.env.CONTEXT;
    try {
      process.env.DATABASE_URL='postgresql://unused.invalid/disposable';process.env.CONTEXT='dev';state.__pgSqlPromise__=Promise.resolve(sql);
      const {myCoach,saveCoach,saveAvailability}=await import('./coaching.server');
      const profile={name:'Coach',specialties:[],career:'',approach:'',ages:'',achievements:'',welcome:'',published:false};
      await assert.rejects(()=>myCoach('coach'),/inactive/);
      await assert.rejects(()=>saveCoach('coach',profile),/inactive/);
      await assert.rejects(()=>saveAvailability('coach',{windows:[{weekday:'Mon',start:'16:00',end:'18:00'}]}),/inactive/);
      const [unchanged]=await sql.query<{revision:number}>("select revision from pd_working_file where id='club'");assert.equal(unchanged.revision,7);
      assert.deepEqual(await sql`select id from coach_profiles`,[]);
      full.coaches[0].active=true;
      await sql`update pd_working_file set payload=${JSON.stringify(full)} where id='club'`;
      assert.equal((await myCoach('coach')).coach.id,'coach-record');
      await saveCoach('coach',profile);
      await saveAvailability('coach',{windows:[{weekday:'Mon',start:'16:00',end:'18:00'}]});
      const active=await myCoach('coach');assert.equal(active.availability.length,1);assert.equal(active.profile?.name,'Coach');
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
