import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { emptyDevelopment } from "../pd/empty";

test("authenticated parent checkout uses full server schedules without exposing them", async () => {
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


    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('parent','parent@example.invalid','Parent',true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values('parent','parent@example.invalid','Parent','parent','family')`;
    await sql`insert into club_staff(id,name,email,role,active) values('staff','Synthetic Coach','coach@example.invalid','coach',true)`;
    await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','s2',65)`;
    const full=emptyDevelopment();
    full.families=[{id:'family',email:'parent@example.invalid',name:'Household',parentName:'Parent',phone:'',athleteIds:[]}];
    full.coaches=[{id:'coach',name:'Synthetic Coach',email:'coach@example.invalid',active:true,specialties:['Pitching']}];
    full.availability=[{id:'window',coachId:'coach',weekday:'Mon–Fri',window:'16:00–20:00'}];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(full)},0)`;
    const state=globalThis as typeof globalThis & {__pgSqlPromise__?:Promise<Sql>};
    const oldSql=state.__pgSqlPromise__,oldUrl=process.env.DATABASE_URL,oldContext=process.env.CONTEXT;
    try {
      process.env.DATABASE_URL='postgresql://unused.invalid/disposable';
      process.env.CONTEXT='dev';
      state.__pgSqlPromise__=Promise.resolve(sql);
      const {checkoutContext}=await import('./checkout.server');
      const context=await checkoutContext('parent');
      assert.deepEqual(context.coaches,[{id:'coach',name:'Synthetic Coach',serviceIds:['s2'],specialties:['Pitching']}]);
      assert.ok(!JSON.stringify(context.coaches).includes('@example.invalid'));
      assert.ok(!JSON.stringify(context.coaches).includes('16:00'));
      await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','youth-pitching',65)`;
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('coach-account','coach@example.invalid','Synthetic Coach',true,now(),now())`;
      await sql`insert into person_profiles(user_id,instructor) values('coach-account',false)`;
      const youth=await checkoutContext('parent');
      assert.ok(youth.coaches[0].serviceIds.includes('youth-pitching'));
      assert.ok(youth.coachAvailability[0].serviceIds.includes('youth-pitching'));
      full.availability=[];
      await sql`update pd_working_file set payload=${JSON.stringify(full)} where id='club'`;
      const noHours=await checkoutContext('parent');
      assert.equal(noHours.coaches[0].id,'coach');
      assert.deepEqual(noHours.coachAvailability,[]);
      full.availability=[{id:'window',coachId:'coach',weekday:'Mon',window:'16:00–20:00'}];
      await sql`update pd_working_file set payload=${JSON.stringify(full)} where id='club'`;
      await sql`delete from club_staff_services where staff_id='staff'`;
      assert.deepEqual((await checkoutContext('parent')).coaches,[]);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
