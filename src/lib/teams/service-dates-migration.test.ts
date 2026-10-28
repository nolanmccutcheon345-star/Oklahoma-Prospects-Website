import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("date correction matches only the unique unpublished Navy draft and is idempotent", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create table club_state(id text primary key, payload jsonb, rev int default 1, updated_at timestamptz); create table club_audit(user_id text,action text,detail text);`,
    );
    await db.exec(await readFile("migrations/0046_team_fee_plans.sql", "utf8"));
    const migration = await readFile("migrations/0053_navy_service_dates.sql", "utf8");
    for (const mode of ["eligible", "published", "accepted", "ambiguous", "otherdates"]) {
      const team = {
        id: "navy",
        name: "Prospects 14U Navy",
        sport: "softball",
        age: "14U",
        seasonStart: "2027-02-10",
        seasonEnd: "2027-07-10",
        months: 6,
        roster: mode === "accepted" ? [{ feeLock: { amount: 2750 } }] : [],
      };
      const plan = {
        status: "draft",
        defaults: { key: "softball:14:springSummer" },
        budget: {
          start: mode === "otherdates" ? "2027-02-11" : "2027-02-10",
          end: "2027-07-10",
          months: 6,
        },
        history: [],
        ...(mode === "published" ? { published: { full: 275000 } } : {}),
      };
      await db.exec("delete from club_state;delete from team_fee_plans;delete from club_audit;");
      await db.query(`insert into club_state(id,payload) values('oklahoma-prospects',$1)`, [
        JSON.stringify({
          teams: mode === "ambiguous" ? [team, { ...team, id: "another" }] : [team],
        }),
      ]);
      await db.query(`insert into team_fee_plans(team_id,payload) values('navy',$1)`, [
        JSON.stringify(plan),
      ]);
      await db.exec(migration);
      await db.exec(migration);
      const {
        rows: [row],
      } = await db.query<{ payload: typeof plan; revision: number }>(
        "select payload,revision from team_fee_plans",
      );
      assert.equal(
        row.payload.budget.start,
        mode === "eligible" ? "2027-02-01" : plan.budget.start,
      );
      assert.equal(row.payload.budget.end, mode === "eligible" ? "2027-07-31" : "2027-07-10");
      assert.equal(row.revision, mode === "eligible" ? 1 : 0);
    }
  } finally {
    await db.close();
  }
});
