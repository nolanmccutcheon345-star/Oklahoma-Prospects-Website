import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";

test("owner lookup separates historic booking, provider funds and attendance without writes", async () => {
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
    sql.transaction = (fn) =>
      db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const state = globalThis as typeof globalThis & { __pgSqlPromise__?: Promise<Sql> };
  const old = state.__pgSqlPromise__,
    oldUrl = process.env.DATABASE_URL,
    oldContext = process.env.CONTEXT;
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    state.__pgSqlPromise__ = Promise.resolve(sql);
    process.env.DATABASE_URL = "postgresql://unused.invalid/disposable";
    process.env.CONTEXT = "dev";
    for (const role of ["admin", "coach", "parent", "player"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${role},${role + "@example.invalid"},${role},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role) values(${role},${role + "@example.invalid"},${role},${role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('admin@example.invalid','admin')`;
    await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status) values('order','order','parent','parent@example.invalid','cage','cage','{}',5000,'paid')`;
    await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status) values('payment','order','production',5000,5000,'COMPLETED')`;
    await sql`insert into booking_records(id,order_id,user_id,product_id,starts_at,ends_at,resources,status) values('historic','order','parent','cage','2020-10-22T22:00:00Z','2020-10-22T23:00:00Z','["lane:1"]','confirmed')`;
    await sql`insert into booking_records(id,user_id,product_id,starts_at,ends_at,resources,status) values('block','admin','admin-block','2030-10-22T22:00:00Z','2030-10-22T23:00:00Z','["lane:2"]','confirmed')`;
    const before = await sql`select to_jsonb(b) as row from booking_records b order by id`;
    const { officeBookingReference } = await import("./operations.server");
    for (const role of ["coach", "parent", "player"])
      await assert.rejects(() => officeBookingReference(role, "historic"), /access|Player/i);
    const result = await officeBookingReference("admin", " historic ");
    assert.equal(result?.customer_email, "parent@example.invalid");
    assert.deepEqual(result?.resources, ["lane:1"]);
    assert.equal(result?.checked_in_at, null);
    assert.equal(result?.status, "confirmed");
    assert.equal(result?.payments[0].refunded_cents, 5000);
    assert.equal(result?.payments[0].status, "COMPLETED");
    assert.deepEqual((await officeBookingReference("admin", "block"))?.payments, []);
    assert.equal(await officeBookingReference("admin", "missing"), null);
    assert.deepEqual(
      await sql`select to_jsonb(b) as row from booking_records b order by id`,
      before,
    );
  } finally {
    state.__pgSqlPromise__ = old;
    if (oldUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldUrl;
    if (oldContext === undefined) delete process.env.CONTEXT;
    else process.env.CONTEXT = oldContext;
    await db.close();
  }
});
