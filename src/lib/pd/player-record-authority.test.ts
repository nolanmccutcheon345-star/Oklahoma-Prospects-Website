import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { emptyDevelopment } from "./empty";
import { seedDevelopment } from "./seed";

test("real player desk reads do not create working-file households and saves preserve administrative records", async () => {
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


    for (const id of ['parent','player','unlinked']) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id+'@example.invalid'},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,player_name,family_id) values(${id},${id+'@example.invalid'},${id},${id==='parent'?'parent':'player'},'Synthetic Athlete','linked-household')`;
    }
    await sql`insert into club_households(id,primary_email) values('linked-household','parent@example.invalid')`;
    await sql`insert into household_members(household_id,user_id) values('linked-household','parent'),('linked-household','player')`;
    const full = emptyDevelopment();
    full.revision=7;
    full.families=[{id:'family',email:'parent@example.invalid',name:'Original Household',parentName:'Original Parent',phone:'Original phone',athleteIds:['self'],leaderboardOptOut:true}];
    full.athletes=[{...seedDevelopment().athletes[0],id:'self',familyId:'family',firstName:'Synthetic',lastName:'Athlete',coachIds:[]}];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(full)},7)`;
    const state = globalThis as typeof globalThis & {__pgSqlPromise__?:Promise<Sql>};
    const previousSql=state.__pgSqlPromise__;
    const previousUrl=process.env.DATABASE_URL;
    const previousContext=process.env.CONTEXT;
    try {
      // Inject a migrated disposable SQL backend; never connect to this placeholder URL.
      process.env.DATABASE_URL='postgresql://unused.invalid/disposable';
      process.env.CONTEXT='dev';
      state.__pgSqlPromise__=Promise.resolve(sql);
      const {loadDeskForUser,saveDeskForUser}=await import('./desk-impl.server');
      const linked=await loadDeskForUser('player');
      assert.equal(linked.data.athletes.length,1);
      const unlinked=await loadDeskForUser('unlinked');
      assert.equal(unlinked.data.athletes.length,0);
      assert.equal(unlinked.data.families.length,0);
      const [readState]=await sql.query<{payload:string;revision:number}>("select payload,revision from pd_working_file where id='club'");
      assert.equal(readState.revision,7);
      assert.equal(JSON.parse(readState.payload).families.length,1);
      const incoming=structuredClone(linked.data);
      Object.assign(incoming.athletes[0],{firstName:'Changed',birthDate:'invalid',sport:'invalid'});
      Object.assign(incoming.families[0],{name:'Changed Household',phone:'forged',leaderboardOptOut:false});
      await saveDeskForUser('player',incoming);
      const [saved]=await sql.query<{payload:string;revision:number}>("select payload,revision from pd_working_file where id='club'");
      const payload=JSON.parse(saved.payload);
      assert.equal(saved.revision,8);
      assert.equal(payload.athletes[0].firstName,'Synthetic');
      assert.equal(payload.athletes[0].birthDate,full.athletes[0].birthDate);
      assert.equal(payload.families[0].name,'Original Household');
      assert.equal(payload.families[0].phone,'Original phone');
      assert.equal(payload.families[0].leaderboardOptOut,true);
    } finally {
      state.__pgSqlPromise__=previousSql;
      if(previousUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=previousUrl;
      if(previousContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=previousContext;
    }
  } finally {
    await db.close();
  }
});
