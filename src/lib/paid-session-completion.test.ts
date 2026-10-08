import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {randomUUID} from "node:crypto";
import type {Sql} from "./db";
import {emptyDevelopment} from "./pd/empty";
import {seedDevelopment} from "./pd/seed";
test('assessment completion requires paid ledger evidence and rolls back invalid attempts',async()=>{
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
      const {completeSession}=await import('./commerce/portal.server');
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status) values('order','order','parent','parent@example.invalid','athlete','s1','lesson','{"discipline":"Pitching"}',14900,'pending')`;
      await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status) values('assessment','order','parent','athlete','coach-record','s1','2026-01-01T18:00:00Z','2026-01-01T19:15:00Z','[]','confirmed')`;
      for(const status of ['pending','payment_review','refunded','cancelled']) {
       await sql`update commerce_orders set status=${status} where id='order'`;
       await assert.rejects(()=>completeSession('coach','assessment','Synthetic full assessment recap'),/verified paid order/);
       assert.equal((await sql<{status:string}>`select status from booking_records where id='assessment'`)[0].status,'confirmed');
       assert.equal((await sql`select id from athlete_assessments`).length,0);
       assert.equal((await sql`select booking_id from contractor_earnings`).length,0);
      }
      await sql`update commerce_orders set status='paid' where id='order'`;
      assert.equal((await completeSession('coach','assessment','Synthetic full assessment recap')).assessmentCompleted,true);
      await completeSession('coach','assessment','Second delivery attempt');
      assert.equal((await sql`select id from athlete_assessments`).length,1);
      assert.equal((await sql<{status:string}>`select status from booking_records where id='assessment'`)[0].status,'completed');
      assert.equal((await sql<{notes:string}>`select notes from athlete_assessments`)[0].notes,'Synthetic full assessment recap');
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
