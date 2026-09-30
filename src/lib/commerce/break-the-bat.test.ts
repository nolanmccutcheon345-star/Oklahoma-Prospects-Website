import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { Quote } from "./contracts";
import { applyDiscount, type Discount } from "./discounts";
import { assertBreakTheBatAvailable, lockBreakTheBatCustomer } from "./break-the-bat.server";
const discount: Discount = {
  id: "bat-discount",
  code: "BREAKTHEBAT10",
  kind: "percentage",
  value: 1000,
  starts_on: null,
  ends_on: null,
  active: true,
  version: 1,
  purchase_types: ["cage", "lesson"],
};
const base: Quote = {
  productId: "individual",
  kind: "cage",
  title: "Cage",
  totalCents: 5250,
  regularCents: 5250,
  setupCents: 0,
  recurring: false,
  assessment: false,
  duration: 60,
  sessionMinutes: 60,
  credits: 0,
  remote: 0,
  expiresDays: 0,
  discipline: "Cage",
  resources: ["lane:1"],
  lines: [{ label: "Cage", cents: 5250 }],
  teamRate: false,
  needsSlot: true,
};
const quote = applyDiscount(base, discount);
test("campaign is exactly ten percent for one cage or an eligible private lesson", () => {
  assert.equal(quote.totalCents, 4725);
  assert.equal(
    applyDiscount(
      { ...base, kind: "lesson", resources: ["coach:a"], totalCents: 10400, regularCents: 10400 },
      discount,
    ).totalCents,
    9360,
  );
  for (const change of [
    { resources: ["lane:1", "lane:2"] },
    { resources: ["lane:3-4"] },
    { kind: "lesson", assessment: true },
    { kind: "package" },
    { kind: "membership", recurring: true },
    { kind: "lesson", needsSlot: false },
    { setupCents: 5000 },
  ])
    assert.throws(() => applyDiscount({ ...base, ...change }, discount));
  assert.throws(() => applyDiscount(base, { ...discount, value: 2000 }));
  assert.throws(() => applyDiscount(quote, discount), /one discount/);
});
test("durable payment attempts enforce reuse, definite declines retry, identities are isolated", async () => {
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
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = wrap(db.query.bind(db));
    const customer = {
      userId: "bat-parent",
      email: "verified@example.invalid",
      environment: "sandbox",
    };
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${customer.userId},${customer.email},'Fixture',true,now(),now())`;
    const id = randomUUID();
    await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment) values(${id},${id},${customer.userId},${customer.email},'individual','cage',${JSON.stringify(quote)}::jsonb,4725,now()+interval '10 minutes','square','sandbox')`;
    await assertBreakTheBatAvailable(sql, quote, customer);
    const attempt = randomUUID();
    await sql.transaction(async (tx) => {
      await lockBreakTheBatCustomer(tx, quote, customer, id);
      await tx`insert into square_payment_attempts(id,order_id,token_hash) values(${attempt},${id},'fixture-hash')`;
    });
    for (const status of ["pending", "unknown", "completed"]) {
      await sql`update square_payment_attempts set status=${status} where id=${attempt}`;
      await assert.rejects(() => assertBreakTheBatAvailable(sql, quote, customer), /one use/);
      await assert.rejects(
        () =>
          sql.transaction((tx) => lockBreakTheBatCustomer(tx, quote, customer, "another-order")),
        /one use/,
      );
      await assertBreakTheBatAvailable(sql, quote, customer, id); // same idempotent order
      await assertBreakTheBatAvailable(sql, quote, {
        ...customer,
        userId: "another",
        email: "other@example.invalid",
      });
      await assert.rejects(
        () =>
          assertBreakTheBatAvailable(sql, quote, {
            ...customer,
            userId: "changed-id",
            email: " VERIFIED@EXAMPLE.INVALID ",
          }),
        /one use/,
      );
    }
    await sql`update square_payment_attempts set status='declined' where id=${attempt}`;
    await assertBreakTheBatAvailable(sql, quote, customer);
    await sql`update commerce_orders set square_payment_id='payment-complete',status='refunded' where id=${id}`;
    await assert.rejects(() => assertBreakTheBatAvailable(sql, quote, customer), /one use/);
    await assertBreakTheBatAvailable(sql, quote, { ...customer, environment: "production" }); // sandbox never consumes the live offer
    await assertBreakTheBatAvailable(sql, base, customer); // unrelated checkout untouched
  } finally {
    await db.close();
  }
});
