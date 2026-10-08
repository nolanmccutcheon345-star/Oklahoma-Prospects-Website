import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { householdChangeMonth, householdChangeAvailable, consumeHouseholdChange, parentCancellationRefund } from "./booking-change-policy.server";

test("family refund boundaries use one combined household allowance", () => {
  const now = new Date("2026-10-05T18:00:00Z");
  for (const [hours, expected] of [[48, 10001], [47.999, 5001], [24, 5001], [23.999, 0]]) {
    const start = new Date(+now + hours * 3600000);
    assert.equal(parentCancellationRefund(10001, start, true, now), expected);
    assert.equal(parentCancellationRefund(10001, start, false, now), 0);
  }
  assert.throws(() => parentCancellationRefund(-1, now, false, now), /Invalid refund/);
});

test("calendar month is Chicago local time through daylight saving changes", () => {
  assert.equal(householdChangeMonth(new Date("2026-04-01T04:59:59Z")), "2026-03");
  assert.equal(householdChangeMonth(new Date("2026-04-01T05:00:00Z")), "2026-04");
  assert.equal(householdChangeMonth(new Date("2026-12-01T05:59:59Z")), "2026-11");
  assert.equal(householdChangeMonth(new Date("2026-12-01T06:00:00Z")), "2026-12");
});

test("real database allowance is shared, retryable and transactional", async t => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (await query(parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""), values)).rows) as Sql;
    sql.transaction = work => db.transaction(tx => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    await db.exec(`create table commerce_policy(id text primary key,value jsonb not null,updated_by text not null);
      create table booking_records(id text primary key,household_id text);
      create table commerce_refunds(id text primary key,booking_id text,created_at timestamptz,reason text);`);
    const sql = wrap(db.query.bind(db));
    const now = new Date("2026-10-05T18:00:00Z");
    const consume = (household: string, user: string, key: string, kind: "cancellation" | "reschedule" = "cancellation", date = now) =>
      sql.transaction(tx => consumeHouseholdChange(tx, household, user, key, kind, date));
    await t.test("different parent accounts and athletes share the allowance", async () => {
      assert.equal(await consume("household-a", "parent-a", "booking:athlete-one"), true);
      assert.equal(await consume("household-a", "parent-b", "booking:athlete-two"), false);
      assert.equal(await consume("household-b", "parent-c", "booking:athlete-three"), true);
      assert.equal(await consume("household-a", "parent-b", "booking:athlete-one"), true);
    });
    await t.test("a reschedule and cancellation consume the same allowance", async () => {
      assert.equal(await consume("household-reschedule", "parent", "move:one", "reschedule"), true);
      assert.equal(await consume("household-reschedule", "parent", "booking:two"), false);
    });
    await t.test("a failed booking change rolls back allowance consumption", async () => {
      await assert.rejects(sql.transaction(async tx => {
        await consumeHouseholdChange(tx, "rollback", "parent", "failed", "cancellation", now);
        throw new Error("Booking validation failed");
      }), /Booking validation failed/);
      assert.equal(await householdChangeAvailable(sql, "rollback", "next", now), true);
    });
    await t.test("concurrent different booking changes cannot both claim the allowance", async () => {
      const results = await Promise.all([
        consume("shared", "parent-one", "booking:one"), consume("shared", "parent-two", "booking:two"),
      ]);
      assert.deepEqual(results.sort(), [false, true]);
    });
    await t.test("allowance resets at Chicago midnight on the first", async () => {
      assert.equal(await consume("household-a", "parent-a", "november", "cancellation", new Date("2026-11-01T04:59:59Z")), false);
      assert.equal(await consume("household-a", "parent-a", "november", "cancellation", new Date("2026-11-01T05:00:00Z")), true);
    });
    await t.test("known earlier family cancellations count, coach and closure refunds do not", async () => {
      await sql`insert into booking_records values('earlier','history'),('coach','club-change')`;
      await sql`insert into commerce_refunds values('earlier','earlier',${now.toISOString()},'Family booking cancellation'),('coach','coach',${now.toISOString()},'Coach initiated cancellation')`;
      assert.equal(await householdChangeAvailable(sql, "history", "another", now), false);
      assert.equal(await consume("history", "parent", "another"), false);
      assert.equal(await householdChangeAvailable(sql, "club-change", "new", now), true);
    });
    await t.test("missing household fails closed rather than counting by login", async () => {
      await assert.rejects(consume("", "parent", "new"), /verified billing household/);
    });
  } finally { await db.close(); }
});
