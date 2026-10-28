import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import {
  operationalEventSessionKey,
  replaceOperationalOccupancy,
} from "./operational-schedule.server";
test("operational schedule schema preserves original records, immutable identity and atomic occupancy", async () => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
      (
        await query(
          p.reduce((s, x, i) => s + (i ? "$" + i : "") + x, ""),
          v,
        )
      ).rows) as Sql;
    sql.query = (async (s: string, v: unknown[] = []) => (await query(s, v)).rows) as Sql["query"];
    sql.transaction = async () => {
      throw Error("Nested transaction");
    };
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  sql.transaction = (fn) => db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    await sql`insert into "user"(id,email,name,"emailVerified") values('operator','operator@example.invalid','Synthetic operator',true)`;
    await sql`insert into booking_records(id,user_id,product_id,starts_at,ends_at,resources,status) values('booking','operator','practice','2030-01-01T18:00:00Z','2030-01-01T19:00:00Z','["lane:fixture"]'::jsonb,'confirmed')`;
    const original = await sql`select to_jsonb(b) as row from booking_records b where id='booking'`;
    await sql`insert into operational_booking_changes(booking_id,revision,starts_at,ends_at,status,reason,updated_by,source_kind) values('booking',1,'2030-01-02T18:00:00Z','2030-01-02T19:00:00Z','cancelled','Weather schedule correction','operator','operator')`;
    assert.deepEqual(
      await sql`select to_jsonb(b) as row from booking_records b where id='booking'`,
      original,
    );
    assert.equal(
      (
        await sql<{
          status: string;
        }>`select status from operational_booking_schedule where id='booking'`
      )[0].status,
      "cancelled",
    );
    await sql`update booking_records set status='cancelled' where id='booking'`;
    await sql`update operational_booking_changes set status='confirmed',revision=2 where booking_id='booking'`;
    assert.equal(
      (
        await sql<{
          status: string;
        }>`select status from operational_booking_schedule where id='booking'`
      )[0].status,
      "cancelled",
    );
    await sql.transaction((tx) =>
      replaceOperationalOccupancy(
        tx,
        { id: "booking", resources: ["lane:fixture"], athlete_id: null },
        new Date("2030-01-02T18:00:00Z"),
        new Date("2030-01-02T19:00:00Z"),
        false,
      ),
    );
    assert.equal((await sql`select * from booking_occupancy`).length, 12);
    await assert.rejects(
      sql.transaction(async (tx) => {
        await replaceOperationalOccupancy(
          tx,
          { id: "booking", resources: ["lane:fixture"], athlete_id: null },
          new Date("2030-01-03T18:00:00Z"),
          new Date("2030-01-03T19:00:00Z"),
          false,
        );
        throw Error("Synthetic rollback");
      }),
      /rollback/,
    );
    assert.equal(
      (await sql`select * from booking_occupancy where slot_at='2030-01-02T18:00:00Z'`).length,
      1,
    );
    await assert.rejects(sql`delete from operational_booking_history`, /append|immutable|history/i);
    const session = { date: "2030-01-01", start: "12:00", end: "13:00" };
    assert.equal(
      operationalEventSessionKey("event", session),
      operationalEventSessionKey("event", { ...session }),
    );
    assert.notEqual(
      operationalEventSessionKey("event", session),
      operationalEventSessionKey("other", session),
    );
  } finally {
    await db.close();
  }
});
