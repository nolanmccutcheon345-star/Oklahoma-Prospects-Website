import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Square } from "square";
import type { Sql } from "../db";
import { calculateQuote, checkoutInput, type CheckoutInput, type Product } from "./contracts";
import { applyDiscount, discountInput, discountStatus, type DiscountInput } from "./discounts";
import {
  assertDiscountCurrent,
  listDiscountsFor,
  quoteWithDiscount,
  saveDiscountFor,
} from "./discounts.server";
import { fulfillSquarePayment } from "./square-payments.server";
import { applySquareRefundBalance } from "./square-refunds.server";
import { queueExpiredCheckoutRefunds } from "./store.server";
import { checkoutReturnPath, parsePaySearch, quoteCages } from "../pay";
import type { PublicCatalog } from "../ops";

const cages = [
  ["individual", 50],
  ["team", 60],
  ["field", 75],
].map(([id, price]) => ({
  id,
  price,
  kind: "cage",
  name: id,
  active: true,
  minutes: 60,
  credits: 0,
  remote: 0,
  expires_days: 0,
  hours: 0,
  discipline: "Cage",
})) as Product[];
const input: CheckoutInput = {
  requestId: randomUUID(),
  productId: "individual",
  kind: "cage",
  name: "Fixture",
  email: "fixture@example.invalid",
  household: true,
  athleteCount: 2,
  consent: false,
  laneIds: ["1"],
  date: "2026-09-21",
  time: "16:00",
  duration: 60,
};
const quote = (changes: Partial<CheckoutInput> = {}) =>
  calculateQuote({ ...input, ...changes }, cages[0], false, cages);
const now = new Date("2026-09-22T20:00:00Z");
const definition: DiscountInput = {
  code: "SAVE10",
  kind: "percentage",
  value: 1000,
  startsOn: null,
  endsOn: null,
  active: true,
  purchaseTypes: ["cage"],
};

test("the former promotion no longer changes standard prices or survives checkout links", () => {
  assert.equal(quote({ duration: 30 }).totalCents, 2500);
  assert.equal(quote().totalCents, 5000);
  assert.equal(quote({ laneIds: ["1", "2"] }).totalCents, 10000);
  assert.equal(quote({ athleteCount: 3, laneIds: ["1", "2"] }).totalCents, 12000);
  assert.equal(quote({ laneIds: ["3-4"] }).totalCents, 7500);
  assert.equal(checkoutInput.safeParse({ ...input, schoolAge: true }).success, false);
  assert.equal(
    checkoutInput.safeParse({ ...input, totalCents: 1, discountCents: 4999 }).success,
    false,
  );
  const search = parsePaySearch({ ...input, schoolAge: true, kind: "cage", id: "individual" });
  assert.doesNotMatch(checkoutReturnPath(search), /schoolAge|promotion/);
  const catalog = { cages: cages.map((p) => ({ id: p.id, price: p.price })) } as PublicCatalog;
  assert.equal(
    quoteCages(catalog, { rate: "individual", laneIds: ["1"], minutes: 60, use: "household" })!
      .price,
    50,
  );
});

test("discount definitions reject invalid values, ranges and client authority fields", () => {
  for (const changes of [
    { value: 0 },
    { value: -1 },
    { value: 10000 },
    { value: 1.5 },
    { startsOn: "2026-02-30" },
    { startsOn: "2026-10-02", endsOn: "2026-10-01" },
    { code: "x" },
    { code: "<script>" },
    { role: "admin" },
    { purchaseTypes: [] },
    { purchaseTypes: ["membership"] },
    { purchaseTypes: ["cage", "cage"] },
    { id: randomUUID() },
  ])
    assert.equal(
      discountInput.safeParse({ ...definition, ...changes }).success,
      false,
      JSON.stringify(changes),
    );
  assert.equal(discountInput.parse({ ...definition, code: " save10 " }).code, "SAVE10");
});

test("admin discounts, cross-role access, payment fulfillment and refunds use actual migrated SQL", async (t) => {
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
    for (const role of [
      "admin",
      "coach",
      "parent",
      "player",
      "fake-admin",
      "unverified",
      "disabled",
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt","disabledAt") values(${role},${role + "@example.invalid"},${role},${role !== "unverified"},now(),now(),${role === "disabled" ? now.toISOString() : null})`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${role},${role + "@example.invalid"},${role},${role === "fake-admin" ? "admin" : ["unverified", "disabled"].includes(role) ? "parent" : role},${"fam-" + role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('admin@example.invalid','admin')`;
    const first = await saveDiscountFor(sql, "admin", definition);

    await t.test(
      "only verified granted admins list/create/edit codes; forged admin and every customer role fail",
      async () => {
        for (const role of [
          "coach",
          "parent",
          "player",
          "fake-admin",
          "unverified",
          "disabled",
          "guest",
        ]) {
          await assert.rejects(() => listDiscountsFor(sql, role));
          await assert.rejects(() =>
            saveDiscountFor(sql, role, { ...definition, code: "DENIED-" + role }),
          );
          await assert.rejects(() =>
            saveDiscountFor(sql, role, {
              ...definition,
              id: first.id,
              version: first.version,
              active: false,
            }),
          );
        }
        assert.equal((await listDiscountsFor(sql, "admin")).length, 1);
        await assert.rejects(
          () => saveDiscountFor(sql, "admin", { ...definition, code: "save10" }),
          /already exists/,
        );
      },
    );
    await t.test(
      "percent and fixed discounts use integer cents, preserve lanes and never stack",
      async () => {
        const percent = await quoteWithDiscount(sql, quote(), " save10 ", now);
        assert.equal(percent.totalCents, 4500);
        assert.equal(percent.regularCents, 4500);
        assert.equal(percent.subtotalCents, 5000);
        assert.equal(percent.discount!.cents, 500);
        assert.equal(
          percent.lines.reduce((n, l) => n + l.cents, 0),
          4500,
        );
        assert.deepEqual(percent.resources, quote().resources);
        assert.equal(percent.duration, 60);
        await saveDiscountFor(sql, "admin", {
          ...definition,
          code: "TENOFF",
          kind: "fixed",
          value: 1000,
        });
        assert.equal((await quoteWithDiscount(sql, quote(), "TENOFF", now)).totalCents, 4000);
        assert.equal(
          (await quoteWithDiscount(sql, quote({ laneIds: ["1", "2"] }), "TENOFF", now)).totalCents,
          9000,
        );
        await assert.rejects(() => quoteWithDiscount(sql, percent, "SAVE10", now), /one discount/);
        await assert.rejects(() => quoteWithDiscount(sql, quote(), "UNKNOWN", now), /not found/);
        await assert.rejects(
          () => quoteWithDiscount(sql, { ...quote(), recurring: true }, "SAVE10", now),
          /one-time/,
        );
        assert.throws(
          () => applyDiscount(quote(), { ...first, kind: "fixed", value: 5000 }, now),
          /at least/,
        );
        assert.equal(
          applyDiscount(quote(), { ...first, kind: "fixed", value: 4999 }, now).totalCents,
          1,
        );
        assert.equal(
          applyDiscount(
            { ...quote(), totalCents: 3333, regularCents: 3333 },
            { ...first, value: 1250 },
            now,
          ).totalCents,
          2916,
        );
      },
    );
    await t.test(
      "purchase eligibility is persisted, enforced, and independently selectable for assessments",
      async () => {
        const selected = await saveDiscountFor(sql, "admin", {
          ...definition,
          code: "TRAINING",
          purchaseTypes: ["assessment", "package"],
        });
        assert.deepEqual(selected.purchase_types, ["assessment", "package"]);
        assert.deepEqual(
          (await listDiscountsFor(sql, "admin")).find((d) => d.id === selected.id)?.purchase_types,
          selected.purchase_types,
        );
        const assessment = { ...quote(), kind: "lesson", assessment: true };
        const lesson = { ...quote(), kind: "lesson", assessment: false };
        const pack = { ...quote(), kind: "package", assessment: false };
        for (const q of [assessment, pack])
          assert.equal((await quoteWithDiscount(sql, q, "TRAINING", now)).totalCents, 4500);
        for (const q of [quote(), lesson])
          await assert.rejects(() => quoteWithDiscount(sql, q, "TRAINING", now), /purchase type/);
        const old = await quoteWithDiscount(sql, pack, "TRAINING", now);
        await saveDiscountFor(sql, "admin", {
          ...definition,
          id: selected.id,
          version: selected.version,
          code: selected.code,
          purchaseTypes: ["lesson"],
        });
        await assert.rejects(
          () => sql.transaction((tx) => assertDiscountCurrent(tx, old, now)),
          /changed/,
        );
        assert.equal((await quoteWithDiscount(sql, lesson, "TRAINING", now)).totalCents, 4500);
        await assert.rejects(
          () => quoteWithDiscount(sql, assessment, "TRAINING", now),
          /purchase type/,
        );
        for (const q of [
          { ...lesson, recurring: true },
          { ...quote(), kind: "cage-plan", recurring: true },
          { ...lesson, setupCents: 5000 },
        ])
          await assert.rejects(() => quoteWithDiscount(sql, q, "TRAINING", now), /one-time/);
      },
    );
    await t.test(
      "activation and inclusive Central dates including winter offsets control code availability",
      async () => {
        const dated = { ...first, starts_on: "2026-09-22", ends_on: "2026-09-22" };
        assert.equal(discountStatus(dated, new Date("2026-09-22T04:59:59Z")), "Scheduled");
        assert.equal(discountStatus(dated, new Date("2026-09-22T05:00:00Z")), "Active");
        assert.equal(discountStatus(dated, new Date("2026-09-23T04:59:59Z")), "Active");
        assert.equal(discountStatus(dated, new Date("2026-09-23T05:00:00Z")), "Expired");
        const winter = { ...first, starts_on: null, ends_on: "2026-12-01" };
        assert.equal(discountStatus(winter, new Date("2026-12-02T05:59:59Z")), "Active");
        assert.equal(discountStatus(winter, new Date("2026-12-02T06:00:00Z")), "Expired");
        assert.throws(() => applyDiscount(quote(), { ...first, active: false }, now), /inactive/);
      },
    );
    await t.test(
      "editing persists, stale admin writes fail, and prepared discounts revalidate before payment",
      async () => {
        const old = await quoteWithDiscount(sql, quote(), "SAVE10", now);
        await sql.transaction((tx) => assertDiscountCurrent(tx, old, now));
        const saved = await saveDiscountFor(sql, "admin", {
          ...definition,
          id: first.id,
          version: first.version,
          value: 2000,
        });
        assert.equal(saved.version, 2);
        await assert.rejects(
          () => saveDiscountFor(sql, "admin", { ...definition, id: first.id, version: 1 }),
          /another admin/,
        );
        await assert.rejects(
          () => sql.transaction((tx) => assertDiscountCurrent(tx, old, now)),
          /changed/,
        );
        const changed = await quoteWithDiscount(sql, quote(), "SAVE10", now);
        assert.equal(changed.totalCents, 4000);
        await saveDiscountFor(sql, "admin", {
          ...definition,
          id: first.id,
          version: 2,
          active: false,
        });
        await assert.rejects(() => quoteWithDiscount(sql, quote(), "SAVE10", now), /inactive/);
        await assert.rejects(
          () => sql.transaction((tx) => assertDiscountCurrent(tx, changed, now)),
          /changed/,
        );
        await assert.rejects(
          () =>
            sql.transaction((tx) =>
              assertDiscountCurrent(tx, { ...quote(), promotionId: "after-school-2026-09" }, now),
            ),
          /offer has ended/,
        );
        const audit =
          await sql`select actor_id,after_state from audit_events where target_table='discount_codes' and target_id=${first.id}`;
        assert.equal(audit.length, 3);
        assert.ok(audit.every((a) => a.actor_id === "admin"));
      },
    );
    await t.test(
      "discounted provider amount confirms exactly once; refund never exceeds paid price",
      async () => {
        const quoted = await quoteWithDiscount(sql, quote(), "TENOFF", now);
        const orderId = randomUUID();
        const snapshot = {
          ...quoted,
          bookingWindow: {
            start: "2028-06-01T21:00:00Z",
            end: "2028-06-01T22:00:00Z",
            participantCount: 2,
          },
        };
        await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment,square_customer_id) values(${orderId},${orderId},'parent','parent@example.invalid','individual','cage',${JSON.stringify(snapshot)}::jsonb,4000,now()+interval '10 minutes','square','sandbox','customer')`;
        assert.equal(
          (await sql`select id from booking_records where order_id=${orderId}`).length,
          0,
        );
        const payment: Square.Payment = {
          id: "discount-payment",
          referenceId: orderId,
          status: "COMPLETED",
          sourceType: "CARD",
          locationId: "location",
          customerId: "customer",
          amountMoney: { amount: 4000n, currency: "USD" },
          totalMoney: { amount: 4000n, currency: "USD" },
          createdAt: new Date().toISOString(),
        };
        const config = { environment: "sandbox", locationId: "location" };
        await assert.rejects(
          () =>
            sql.transaction((tx) =>
              fulfillSquarePayment(
                tx,
                {
                  ...payment,
                  amountMoney: { amount: 5000n, currency: "USD" },
                  totalMoney: { amount: 5000n, currency: "USD" },
                },
                config,
              ),
            ),
          /verification/i,
        );
        // Revoking after the payment starts must not invalidate already collected funds.
        const ten = (await listDiscountsFor(sql, "admin")).find((d) => d.code === "TENOFF")!;
        await saveDiscountFor(sql, "admin", {
          ...definition,
          id: ten.id,
          version: ten.version,
          code: ten.code,
          kind: "fixed",
          value: 1000,
          active: false,
        });
        await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
        await sql.transaction((tx) => fulfillSquarePayment(tx, payment, config));
        assert.deepEqual(await sql`select status from booking_records where order_id=${orderId}`, [
          { status: "confirmed" },
        ]);
        assert.equal(
          (await sql`select id from square_payments where order_id=${orderId}`).length,
          1,
        );
        await sql.transaction((tx) =>
          applySquareRefundBalance(
            tx,
            { ...payment, refundedMoney: { amount: 4000n, currency: "USD" } },
            config,
          ),
        );
        await queueExpiredCheckoutRefunds(sql, "sandbox", orderId);
        assert.deepEqual(
          await sql`select amount_cents,refunded_cents from square_payments where order_id=${orderId}`,
          [{ amount_cents: 4000, refunded_cents: 4000 }],
        );
        assert.deepEqual(await sql`select status from booking_records where order_id=${orderId}`, [
          { status: "cancelled" },
        ]);
        assert.equal(
          (
            await sql`select * from booking_occupancy where booking_id in (select id from booking_records where order_id=${orderId})`
          ).length,
          0,
        );
        assert.equal(
          (
            await sql`select * from commerce_refunds where order_id=${orderId} and status in ('pending','unknown')`
          ).length,
          0,
        );
        assert.equal(
          (
            await sql<{
              snapshot: typeof snapshot;
            }>`select snapshot from commerce_orders where id=${orderId}`
          )[0].snapshot.discount!.cents,
          1000,
        );
      },
    );
    await t.test("a revoked owner loses discount-management access", async () => {
      await sql`update owner_grants set revoked_at=now() where user_id='admin'`;
      await assert.rejects(() => listDiscountsFor(sql, "admin"), /Admin access/);
      await assert.rejects(() => saveDiscountFor(sql, "admin", definition), /Admin access/);
    });
  } finally {
    await db.close();
  }
});
