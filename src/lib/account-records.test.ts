import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { readAccountProfile, readLegacySchedule } from "./account-records.server";

test("account readers preserve player schedule while excluding money and unlisted profile columns", async () => {
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

    await sql.query("alter table profiles add column private_billing_token text default 'DO-NOT-EXPOSE'");
    await sql.query("alter table reservations add column provider_token text default 'DO-NOT-EXPOSE'");
    for (const role of ["player", "parent", "coach"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${role},${role+"@example.invalid"},${role},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,player_name,assessment_complete,lesson_credits,remote_credits,plan_name,plan_price) values(${role},${role+"@example.invalid"},${role},${role},'Synthetic Athlete',true,17,9,'PRIVATE PLAN',247)`;
      await sql`insert into reservations(user_id,kind,title,date,start_time,duration_min,price,status) values(${role},'lesson','Pitching','2026-10-20','16:00',60,104,'paid')`;
    }
    for (const role of ["player", "parent", "coach"] as const) {
      const viewer = await resolveIdentity(sql, role);
      const profile = await readAccountProfile(sql, viewer);
      assert.ok(profile);
      assert.equal(profile.role, role);
      assert.equal(profile.player_name, 'Synthetic Athlete');
      assert.equal(profile.assessment_complete, true);
      assert.deepEqual(Object.keys(profile).sort(), ['user_id','name','email','role','player_name','assessment_complete','lesson_credits','remote_credits','plan_name','plan_price'].sort());
      const schedule = await readLegacySchedule(sql, viewer);
      assert.equal(schedule.length, 1);
      assert.equal(schedule[0].user_id, role);
      assert.equal(schedule[0].start_time, '16:00');
      assert.equal(schedule[0].duration_min, 60);
      assert.equal(schedule[0].status, 'paid');
      assert.ok(!JSON.stringify([profile,schedule]).includes('DO-NOT-EXPOSE'));
      if(role === 'player') {
        assert.equal(profile.lesson_credits, 0);
        assert.equal(profile.remote_credits, 0);
        assert.equal(profile.plan_name, '');
        assert.equal(profile.plan_price, 0);
        assert.equal(schedule[0].price, 0);
      } else {
        assert.equal(profile.lesson_credits, 17);
        assert.equal(profile.remote_credits, 9);
        assert.equal(profile.plan_name, 'PRIVATE PLAN');
        assert.equal(profile.plan_price, 247);
        assert.equal(schedule[0].price, 104);
      }
    }
    const admin = {userId:'owner',email:'owner@example.invalid',role:'admin' as const};
    assert.equal((await readLegacySchedule(sql, admin)).length, 3);
    assert.equal(await readAccountProfile(sql, admin), null);
    const [stored] = await sql.query<{plan_price:number;lesson_credits:number}>("select plan_price,lesson_credits from profiles where user_id='player'");
    assert.equal(stored.plan_price, 247);
    assert.equal(stored.lesson_credits, 17);
  } finally {
    await db.close();
  }
});
