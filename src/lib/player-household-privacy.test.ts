import test from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import type {Sql} from "./db";
test('player household responses exclude guardian contacts and access-management records',async()=>{
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




    for(const id of ['parent','player','unrelated']) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id+'@example.invalid'},${id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id+'@example.invalid'},${id},${id==='player'?'player':'parent'},'linked-household')`;
    }
    await sql`insert into club_households(id,primary_email) values('linked-household','parent@example.invalid')`;
    await sql`insert into household_members(household_id,user_id) values('linked-household','parent'),('linked-household','player')`;
    const state=globalThis as typeof globalThis & {__pgSqlPromise__?:Promise<Sql>};
    const oldSql=state.__pgSqlPromise__,oldUrl=process.env.DATABASE_URL,oldContext=process.env.CONTEXT;
    try {
      process.env.DATABASE_URL='postgresql://unused.invalid/disposable';process.env.CONTEXT='dev';state.__pgSqlPromise__=Promise.resolve(sql);
      const {myHouseholds,issueInvitation}=await import('./invitations.server');
      const parent=await myHouseholds('parent');
      assert.equal(parent.canInvite,true);assert.deepEqual(parent.rows.map(r=>r.user_id).sort(),['parent','player']);
      const player=await myHouseholds('player');
      assert.deepEqual(player,{canInvite:false,userId:'player',rows:[]});
      assert.ok(!JSON.stringify(player).includes('parent@example.invalid'));
      const unrelated=await myHouseholds('unrelated');
      assert.ok(unrelated.rows.every(r=>r.user_id==='unrelated'));
      await assert.rejects(()=>issueInvitation('player','new@example.invalid','parent','linked-household'),/Household access required/);
      assert.deepEqual(await sql`select id from club_invites`,[]);
      await issueInvitation('parent','new@example.invalid','parent','linked-household');
      assert.equal((await sql`select id from club_invites`).length,1);
    } finally {
      state.__pgSqlPromise__=oldSql;
      if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;
      if(oldContext===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=oldContext;
    }
  } finally {await db.close();}
});
