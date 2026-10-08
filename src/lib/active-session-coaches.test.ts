import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {randomUUID} from "node:crypto";
import type {Sql} from "./db";
import {emptyDevelopment} from "./pd/empty";
import {seedDevelopment} from "./pd/seed";
test('coach booking, completion and earning desks require active assignments without matching unassigned rows',async()=>{
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
      const {coachBookings,completeSession}=await import('./commerce/portal.server');
      const {earnings}=await import('./commerce/operations.server');
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status) values('order','order','parent','parent@example.invalid','athlete','s1','lesson','{"discipline":"Pitching"}',14900,'paid')`;
      await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status) values('assigned','order','parent','athlete','coach-record','s1','2026-01-01T18:00:00Z','2026-01-01T19:15:00Z','[]','confirmed'),('unassigned','order','parent','athlete','','s1','2026-01-02T18:00:00Z','2026-01-02T19:15:00Z','[]','confirmed')`;
      await sql`insert into contractor_earnings(booking_id,coach_id,gross_cents,split_pct,amount_cents,status) values('assigned','coach-record',14900,50,7450,'payable'),('unassigned','',14900,50,7450,'payable')`;
      assert.deepEqual((await coachBookings('coach')).map(b=>b.id),['assigned']);
      assert.deepEqual((await earnings('coach')).rows.map(b=>b.booking_id),['assigned']);
      await assert.rejects(()=>completeSession('coach','unassigned','Valid synthetic recap'),/Only an assigned coach/);
      full.coaches[0].active=false;await sql`update pd_working_file set payload=${JSON.stringify(full)}::jsonb where id='club'`;
      await assert.rejects(()=>coachBookings('coach'),/active coach assignment/);
      await assert.rejects(()=>earnings('coach'),/active coach assignment/);
      await assert.rejects(()=>completeSession('coach','assigned','Valid synthetic recap'),/active coach assignment/);
      full.coaches=[];await sql`update pd_working_file set payload=${JSON.stringify(full)}::jsonb where id='club'`;
      await assert.rejects(()=>coachBookings('coach'),/active coach assignment/);
      await assert.rejects(()=>earnings('coach'),/active coach assignment/);
      assert.equal((await sql<{status:string}>`select status from booking_records where id='assigned'`)[0].status,'confirmed');
      await sql`insert into owner_grants(email) values('parent@example.invalid')`;
      assert.equal((await coachBookings('parent')).length,2);
      assert.equal((await earnings('parent')).rows.length,2);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
