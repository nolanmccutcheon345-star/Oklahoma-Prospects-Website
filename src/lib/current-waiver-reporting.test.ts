import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {randomUUID} from "node:crypto";
import type {Sql} from "./db";
import {emptyDevelopment} from "./pd/empty";
import {seedDevelopment} from "./pd/seed";
test('office and household waiver status match check-in for future, current and expired signatures',async()=>{
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
      const {officeOperations}=await import('./commerce/operations.server');
      const {myWaivers}=await import('./portal.server');
      const {enforceVisitWaivers}=await import('./commerce/waivers.server');
      await sql`insert into owner_grants(email) values('parent@example.invalid')`;
      const now=new Date(),start=new Date(Math.floor(now.getTime()/300000)*300000),end=new Date(start.getTime()+3600000);
      await sql`insert into booking_records(id,user_id,athlete_id,product_id,starts_at,ends_at,resources,status,participants_verified) values('visit','parent','athlete','s1',${start.toISOString()},${end.toISOString()},'[]'::jsonb,'confirmed',true)`;
      await sql`insert into booking_participants(booking_id,athlete_id) values('visit','athlete')`;
      await sql`insert into club_waivers(id,user_id,athlete_id,version,signer_name,signed_at,consent_text) values('waiver','parent','athlete','test','Parent',now()+interval '1 day','Test consent')`;
      assert.equal((await officeOperations('parent')).bookings[0].missing_waivers,1);
      assert.equal((await myWaivers('parent')).length,0);
      const booking={id:'visit',participant_count:1,participants_verified:true,starts_at:start,ends_at:end};
      await assert.rejects(enforceVisitWaivers(sql,booking,now),/current annual waiver/);
      await sql`update club_waivers set signed_at=now()-interval '1 day' where id='waiver'`;
      assert.equal((await officeOperations('parent')).bookings[0].missing_waivers,0);
      assert.equal((await myWaivers('parent')).length,1);
      await enforceVisitWaivers(sql,booking,now);
      await sql`update club_waivers set signed_at=now()-interval '2 years' where id='waiver'`;
      assert.equal((await officeOperations('parent')).bookings[0].missing_waivers,1);
      assert.equal((await myWaivers('parent')).length,0);
      await assert.rejects(enforceVisitWaivers(sql,booking,now),/current annual waiver/);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
