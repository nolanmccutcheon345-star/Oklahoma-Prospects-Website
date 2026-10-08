import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { recordSessionMetric } from "./session-metrics.server";
import { emptyDevelopment } from "./pd/empty";
import { seedDevelopment } from "./pd/seed";
test('session logs accept unchanged retries and reject changed or cross-account ID reuse',async()=>{
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




    await sql`insert into club_athletes(id,user_id,household_email,name) values('athlete','parent','parent@example.invalid','Synthetic Athlete'),('other','other','other@example.invalid','Other Athlete')`;
    const input={id:randomUUID(),athleteId:'athlete',track:'Hitting' as const,day:'2026-01-01',successes:8,attempts:10,notes:'Completed tee work'};
    await recordSessionMetric(sql,'parent',input,false);
    await recordSessionMetric(sql,'parent',input,true);
    for(const changed of [{...input,notes:'Changed notes'},{...input,successes:9},{...input,attempts:11},{...input,day:'2026-01-02'},{...input,track:'Pitching' as const},{...input,athleteId:'other'}])
      await assert.rejects(()=>recordSessionMetric(sql,'parent',changed,false),/already been used/);
    await assert.rejects(()=>recordSessionMetric(sql,'other',input,false),/already been used/);
    const [row]=await sql<{notes:string;verified:boolean;successes:number}>`select notes,verified,successes from athlete_session_metrics where id=${input.id}`;
    assert.deepEqual(row,{notes:input.notes,verified:false,successes:8});
    const concurrent={...input,id:randomUUID()};
    await Promise.all([recordSessionMetric(sql,'parent',concurrent,false),recordSessionMetric(sql,'parent',concurrent,false)]);
    assert.equal((await sql`select id from athlete_session_metrics where id=${concurrent.id}`).length,1);

    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('parent','parent@example.invalid','Parent',true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values('parent','parent@example.invalid','Parent','parent','family')`;
    const full=emptyDevelopment();full.families=[{id:'family',email:'parent@example.invalid',name:'Synthetic Household',parentName:'Parent',phone:'',athleteIds:['athlete'],leaderboardOptOut:true}];
    full.athletes=[{...seedDevelopment().athletes[0],id:'athlete',familyId:'family',firstName:'Synthetic',lastName:'Athlete',coachIds:[]}];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(full)},7)`;
    const state=globalThis as typeof globalThis & {__pgSqlPromise__?:Promise<Sql>};
    const oldSql=state.__pgSqlPromise__,oldUrl=process.env.DATABASE_URL,oldContext=process.env.CONTEXT;
    try {
      process.env.DATABASE_URL='postgresql://unused.invalid/disposable';process.env.CONTEXT='dev';state.__pgSqlPromise__=Promise.resolve(sql);
      const {saveMetric}=await import('./coaching.server');
      const actual={...input,id:randomUUID()};
      await saveMetric('parent',actual);await saveMetric('parent',actual);
      await assert.rejects(()=>saveMetric('parent',{...actual,notes:'Different submission'}),/already been used/);
      await assert.rejects(()=>saveMetric('parent',{...actual,id:randomUUID(),athleteId:'other'}),/Forbidden/);
      await assert.rejects(()=>saveMetric('parent',{...actual,id:randomUUID(),day:'2099-01-01'}),/future/);
      await assert.rejects(()=>saveMetric('parent',{...actual,id:randomUUID(),successes:11}),/Invalid input/);
      assert.equal((await sql`select id from athlete_session_metrics where id=${actual.id}`).length,1);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
