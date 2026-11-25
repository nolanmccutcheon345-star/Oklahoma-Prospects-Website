import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { createFacilityBlock, cancelFacilityBlock, facilityBlocks } from "./facility-blocks.server";
import { holdWindow } from "./store.server";
async function fixture() {
  const db = new PGlite();
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${name}`, "utf8"));
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (q: string, values: unknown[] = []) =>
      (await query(q, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  for (const id of ["steve", "sara", "other", "fake"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${id === "steve" || id === "fake" ? "admin" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into staff_authorities(email,capability) values('steve@example.invalid','staff_roles.manage')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  return { db, sql };
}

test("owner blocks share customer occupancy, retry once, reject conflicts atomically, and release cleanly", async () => {
  const { db, sql } = await fixture();
  try {
    const v = {
      id: randomUUID(),
      title: "Synthetic workout",
      date: "2099-11-15",
      time: "16:00",
      duration: 120,
      laneIds: ["1", "2", "3-4"] as ("1" | "2" | "3-4")[],
    };
    for (const user of ["sara", "other", "fake"]) {
      await assert.rejects(() => createFacilityBlock(sql, user, v));
      await assert.rejects(() => facilityBlocks(sql, user));
    }
    await createFacilityBlock(sql, "steve", v);
    await createFacilityBlock(sql, "steve", v);
    assert.equal((await facilityBlocks(sql, "steve")).length, 1);
    assert.equal((await sql`select * from booking_occupancy`).length, 72);
    const [b] = await sql<{
      id: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      order_id: null;
    }>`select * from booking_records where product_id=${"facility-block:" + v.id}`;
    assert.equal(b.status, "confirmed");
    assert.equal(b.order_id, null);
    // Same query shape public availability consumes, even with no commerce order.
    assert.equal(
      (
        await sql`select resource_id from booking_occupancy o join booking_records b on b.id=o.booking_id where b.status in ('confirmed','completed') and resource_id='lane:3-4'`
      ).length,
      24,
    );
    await assert.rejects(() =>
      createFacilityBlock(sql, "steve", { ...v, id: randomUUID(), laneIds: ["1"] }),
    );
    assert.equal((await facilityBlocks(sql, "steve")).length, 1);
    await assert.rejects(() => createFacilityBlock(sql, "steve", { ...v, title: "Changed" }));
    await assert.rejects(() =>
      sql.transaction((tx) =>
        holdWindow(tx, {
          orderId: null,
          userId: "other",
          athleteId: null,
          productId: "synthetic-customer",
          start: new Date(b.starts_at),
          end: new Date(b.ends_at),
          resources: ["lane:1"],
        }),
      ),
    );
    await assert.rejects(() => cancelFacilityBlock(sql, "other", { id: v.id }));
    await cancelFacilityBlock(sql, "steve", { id: v.id });
    await cancelFacilityBlock(sql, "steve", { id: v.id });
    assert.equal((await sql`select * from booking_occupancy`).length, 0);
    assert.equal((await facilityBlocks(sql, "steve"))[0].status, "cancelled");
    assert.equal((await sql`select * from commerce_orders`).length, 0);
    await assert.rejects(() => createFacilityBlock(sql, "steve", v));
    await createFacilityBlock(sql, "steve", { ...v, id: randomUUID() });
    await sql`update owner_grants set revoked_at=now() where user_id='steve'`;
    await assert.rejects(() => facilityBlocks(sql, "steve"));
  } finally {
    await db.close();
  }
});
test("invalid and past blocks do not reserve occupancy", async () => {
  const { db, sql } = await fixture();
  try {
    const v = {
      id: randomUUID(),
      title: "Synthetic",
      date: "2000-01-01",
      time: "14:00",
      duration: 120,
      laneIds: ["1"] as "1"[],
    };
    await assert.rejects(() => createFacilityBlock(sql, "steve", v));
    await assert.rejects(() =>
      createFacilityBlock(sql, "steve", { ...v, date: "2099-11-15", time: "19:30" }),
    );
    await assert.rejects(() => createFacilityBlock(sql, "steve", { ...v, laneIds: [] }));
    await assert.rejects(() => createFacilityBlock(sql, "steve", { ...v, laneIds: ["1", "1"] }));
    assert.equal((await sql`select * from booking_occupancy`).length, 0);
  } finally {
    await db.close();
  }
});

test("existing customer occupancy rejects the entire multi-space block without touching customer data", async () => {
  const { db, sql } = await fixture();
  try {
    const booking = await holdWindow(sql, {
      orderId: null,
      userId: "other",
      athleteId: null,
      productId: "synthetic-customer",
      start: new Date("2099-11-15T22:00:00Z"),
      end: new Date("2099-11-16T00:00:00Z"),
      resources: ["lane:3-4"],
    });
    await sql`update booking_records set status='confirmed' where id=${booking}`;
    const before = await sql`select * from booking_occupancy order by resource_id,slot_at`;
    await assert.rejects(
      () =>
        createFacilityBlock(sql, "steve", {
          id: randomUUID(),
          title: "Synthetic overlapping workout",
          date: "2099-11-15",
          time: "16:00",
          duration: 120,
          laneIds: ["1", "3-4"],
        }),
      /already reserved/,
    );
    assert.deepEqual(
      await sql`select * from booking_occupancy order by resource_id,slot_at`,
      before,
    );
    assert.equal((await sql`select * from facility_blocks`).length, 0);
    assert.equal((await sql`select * from booking_records`).length, 1);
    await assert.rejects(() => cancelFacilityBlock(sql, "steve", { id: randomUUID() }));
    assert.deepEqual(
      await sql`select * from booking_occupancy order by resource_id,slot_at`,
      before,
    );
    await sql`insert into organization_operational_access(user_id,status,financial_restricted,updated_by) values('steve','suspended',true,'steve')`;
    await assert.rejects(() => facilityBlocks(sql, "steve"));
  } finally {
    await db.close();
  }
});
