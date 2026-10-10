import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import type { Coach } from "../pd/types";
import { bookableCoaches, coachesWithAvailability, replaceCoachServices, requireCoachService } from "./coach-services.server";
import { checkoutLessonService } from "./coach-services";

test("admin service assignments persist, control exact booking services, and fail closed", async () => {
  const db = new PGlite();
  const wrap = (run: typeof db.query): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (await run(parts.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, ""), values)).rows) as Sql;
    sql.query = (async (query: string, values: unknown[] = []) => (await run(query, values)).rows) as Sql["query"];
    sql.transaction = work => db.transaction(tx => work(wrap(tx.query.bind(tx) as typeof db.query)));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  try {
    await db.exec(await readFile(new URL("../../../migrations/0005_ops.sql", import.meta.url), "utf8"));
    await db.exec(`
      create table "user" (id text primary key,email text,"disabledAt" timestamptz);
      create table person_profiles (user_id text primary key,instructor boolean);
      insert into club_services(id,kind,name,discipline,minutes) values
        ('s1','lesson','Assessment','Pitching',75),('s2','lesson','Pitching 30','Pitching',30),
        ('s3','lesson','Pitching 60','Pitching',60),('s7','lesson','Hitting 30','Hitting',30),
        ('individual','cage','Household cage','Cage',60);
      insert into club_staff(id,name,email,role,active) values
        ('staff-test','Test coach','coach@example.invalid','coach',true),
        ('staff-off','Inactive coach','off@example.invalid','coach',false),
        ('staff-parent','Parent','parent@example.invalid','parent',true);
    `);
    const roster: Coach[] = [{id:"existing-coach",name:"Old display name",email:"COACH@example.invalid",active:true,specialties:["Hitting","Pitching"]}];
    await sql.transaction(tx => replaceCoachServices(tx, "staff-test", [{serviceId:"s2",profitSplit:65}]));
    const services = [{id:"s1",minutes:75,discipline:"Pitching"},{id:"s2",minutes:30,discipline:"Pitching"},{id:"s3",minutes:60,discipline:"Pitching"}];
    const choices = await bookableCoaches(sql, roster);
    assert.deepEqual(choices, [{id:"existing-coach",name:"Test coach",serviceIds:["s2"],specialties:["Pitching"]}]);
    assert.deepEqual(await coachesWithAvailability(sql,roster,[],services),[]);
    const schedules=[{id:'window',coachId:'existing-coach',weekday:'Mon–Fri',window:'16:00–20:00'}];
    assert.deepEqual(await coachesWithAvailability(sql,roster,schedules,services),choices);
    assert.deepEqual(await coachesWithAvailability(sql,roster,[{...schedules[0],coachId:'other'}],services),[]);
    assert.deepEqual(await coachesWithAvailability(sql,roster,[{...schedules[0],window:'10:00–11:00'}],services),[]);
    assert.deepEqual(await coachesWithAvailability(sql,roster,[{...schedules[0],window:'invalid'}],services),[]);
    assert.equal((await requireCoachService(sql, roster, "existing-coach", "s2")).id,"existing-coach");
    await assert.rejects(requireCoachService(sql, roster, "existing-coach", "s3"), /not assigned/);
    await assert.rejects(requireCoachService(sql, roster, "existing-coach", "s7"), /not assigned/);
    await assert.rejects(requireCoachService(sql, roster, "forged-coach", "s2"), /not assigned/);
    await assert.rejects(sql.transaction(tx => replaceCoachServices(tx,"staff-test",[{serviceId:"missing",profitSplit:65}])));
    await assert.rejects(sql.transaction(tx => replaceCoachServices(tx,"staff-test",[{serviceId:"individual",profitSplit:65}])));
    assert.deepEqual(await sql`select service_id,profit_split from club_staff_services where staff_id='staff-test'`, [{service_id:"s2",profit_split:65}]);
    await sql.transaction(tx => replaceCoachServices(tx,"staff-test",[{serviceId:"s1",profitSplit:70},{serviceId:"s3",profitSplit:65}]));
    assert.deepEqual((await bookableCoaches(sql,roster))[0].serviceIds,["s1","s3"]);
    await assert.rejects(requireCoachService(sql,roster,"existing-coach","s2"),/not assigned/);
    assert.deepEqual((await coachesWithAvailability(sql,roster,schedules,services))[0].serviceIds,['s1','s3']);
    assert.deepEqual(await coachesWithAvailability(sql,roster,[{...schedules[0],window:'19:30–20:00'}],services),[]);
    assert.deepEqual((await coachesWithAvailability(sql,roster,[{...schedules[0],window:'19:00–20:00'}],services))[0].serviceIds,['s3']);
    await sql.transaction(tx => replaceCoachServices(tx,"staff-off",[{serviceId:"s3",profitSplit:60}]));
    await sql.transaction(tx => replaceCoachServices(tx,"staff-parent",[{serviceId:"s3",profitSplit:60}]));
    assert.equal((await bookableCoaches(sql,roster)).length,2); // primary parent role may also instruct
    assert.ok((await bookableCoaches(sql,roster)).some(c=>c.name==='Parent'));
    await sql.transaction(tx=>replaceCoachServices(tx,'staff-parent',[]));
    assert.equal((await bookableCoaches(sql,roster)).length,1);
    assert.deepEqual(await bookableCoaches(sql,[{...roster[0],active:false}]),[]);
    assert.match((await bookableCoaches(sql,[]))[0].id,/^c-[a-f0-9]{32}$/);
    await sql.transaction(tx => replaceCoachServices(tx,"staff-test",[]));
    assert.deepEqual(await bookableCoaches(sql,roster),[]);
  } finally { await db.close(); }
});

test("membership initial appointments use the same service assignment as their booked lesson", () => {
  const q = {kind:"membership",productId:"m1",setupCents:5000,discipline:"Pitching",sessionMinutes:30};
  assert.equal(checkoutLessonService(q),"s1");
  assert.equal(checkoutLessonService({...q,discipline:"Hitting"}),"s9");
  assert.equal(checkoutLessonService({...q,setupCents:0}),"s2");
  assert.equal(checkoutLessonService({...q,setupCents:0,sessionMinutes:60}),"s3");
  assert.equal(checkoutLessonService({...q,kind:"lesson",productId:"s7",setupCents:0}),"s7");
});
