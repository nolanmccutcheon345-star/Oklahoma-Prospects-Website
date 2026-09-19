import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Square, SquareClient } from "square";
import type { Sql } from "../db";
import type { Quote } from "./contracts";
import { fulfillSquarePayment } from "./square-payments.server";
import { syncSquareRefund } from "./square-webhook.server";
import { queueExpiredCheckoutRefunds } from "./store.server";

test("refund ordering cannot confirm returned funds or regress settled balances", async (t) => {
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
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    const config = { environment: "sandbox", locationId: "location" };
    let day = 0;
    const createOrder = async (id: string) => {
      const date = `2028-05-${String(++day).padStart(2, "0")}`;
      const snapshot: Quote & { bookingWindow: object } = {
        productId: "team",
        kind: "cage",
        title: "Team cage",
        totalCents: 12000,
        regularCents: 12000,
        setupCents: 0,
        recurring: false,
        assessment: false,
        duration: 60,
        sessionMinutes: 60,
        credits: 0,
        remote: 0,
        expiresDays: 0,
        discipline: "",
        resources: ["lane:1", "lane:2"],
        lines: [{ label: "Two team cages", cents: 12000 }],
        teamRate: true,
        needsSlot: true,
        bookingWindow: {
          start: date + "T20:00:00Z",
          end: date + "T21:00:00Z",
          participantCount: 6,
        },
      };
      await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment,square_customer_id)
        values(${id},${id},'parent','fixture@example.invalid','team','cage',${JSON.stringify(snapshot)}::jsonb,12000,now()+interval '10 minutes','square','sandbox','customer')`;
    };
    const payment = (id: string, refunded = 0): Square.Payment => ({
      id: "pay-" + id,
      referenceId: id,
      status: "COMPLETED",
      sourceType: "CARD",
      locationId: "location",
      customerId: "customer",
      amountMoney: { amount: 12000n, currency: "USD" },
      totalMoney: { amount: 12000n, currency: "USD" },
      refundedMoney: { amount: BigInt(refunded), currency: "USD" },
      createdAt: new Date().toISOString(),
    });
    const fulfill = (p: Square.Payment) =>
      sql.transaction((tx) => fulfillSquarePayment(tx, p, config));
    const deps = (p: Square.Payment, status = "COMPLETED") => ({
      sql,
      config,
      client: {
        refunds: {
          get: async () => ({
            refund: { id: "refund", paymentId: p.id, locationId: "location", status },
          }),
        },
        payments: { get: async () => ({ payment: p }) },
      } as unknown as SquareClient,
    });
    const state = async (id: string) =>
      (
        await sql<{
          status: string;
          refunded: number;
        }>`select o.status,p.refunded_cents as refunded from commerce_orders o join square_payments p on p.order_id=o.id where o.id=${id}`
      )[0];

    await t.test(
      "fully refunded first observation saves the refund without a booking, receipt or extra refund",
      async () => {
        await createOrder("full-first");
        await fulfill(payment("full-first", 12000));
        await fulfill(payment("full-first", 0)); // stale payment event
        assert.deepEqual(await state("full-first"), { status: "refunded", refunded: 12000 });
        assert.equal(
          (await sql`select id from booking_records where order_id='full-first'`).length,
          0,
        );
        assert.equal(
          (await sql`select id from commerce_refunds where order_id='full-first'`).length,
          0,
        );
        assert.equal(
          (
            await sql`select id from payment_notifications where order_id='full-first' and kind in ('receipt','owner-booking')`
          ).length,
          0,
        );
      },
    );
    await t.test(
      "partially refunded initial payment grants nothing and queues only the remaining funds once",
      async () => {
        await createOrder("partial-first");
        await fulfill(payment("partial-first", 2000));
        await fulfill(payment("partial-first", 0));
        await queueExpiredCheckoutRefunds(sql, "sandbox", "partial-first");
        assert.deepEqual(await state("partial-first"), {
          status: "payment_review",
          refunded: 2000,
        });
        assert.equal(
          (await sql`select id from booking_records where order_id='partial-first'`).length,
          0,
        );
        assert.deepEqual(
          await sql`select amount_cents from commerce_refunds where order_id='partial-first'`,
          [{ amount_cents: 10000 }],
        );
        await syncSquareRefund("refund", deps(payment("partial-first", 12000)));
        assert.deepEqual(
          await sql`select status from commerce_refunds where order_id='partial-first'`,
          [{ status: "completed" }],
        );
        assert.deepEqual(await state("partial-first"), { status: "refunded", refunded: 12000 });
      },
    );
    await t.test(
      "refund-before-payment persists returned money and rejects a later stale payment",
      async () => {
        await createOrder("refund-first");
        await syncSquareRefund("refund", deps(payment("refund-first", 12000)));
        await fulfill(payment("refund-first", 0));
        assert.deepEqual(await state("refund-first"), { status: "refunded", refunded: 12000 });
        assert.equal(
          (await sql`select id from booking_records where order_id='refund-first'`).length,
          0,
        );
      },
    );
    await t.test("refund with an unavailable payment balance remains retryable", async () => {
      await createOrder("balance-pending");
      await assert.rejects(
        syncSquareRefund("refund", deps(payment("balance-pending"))),
        /Payment record pending/,
      );
      assert.equal(
        (await sql`select id from square_payments where order_id='balance-pending'`).length,
        0,
      );
      await syncSquareRefund("refund", deps(payment("balance-pending", 12000)));
      assert.deepEqual(await state("balance-pending"), { status: "refunded", refunded: 12000 });
    });
    await t.test(
      "refund after normal booking releases all lanes and suppresses unsent confirmation",
      async () => {
        await createOrder("normal");
        await fulfill(payment("normal"));
        assert.equal(
          (await sql`select id from booking_records where order_id='normal' and status='confirmed'`)
            .length,
          1,
        );
        await syncSquareRefund("refund", deps(payment("normal", 12000)));
        await fulfill(payment("normal"));
        assert.deepEqual(await state("normal"), { status: "refunded", refunded: 12000 });
        assert.equal(
          (
            await sql`select b.booking_id from booking_occupancy b join booking_records r on r.id=b.booking_id where r.order_id='normal'`
          ).length,
          0,
        );
        assert.equal(
          (
            await sql`select id from payment_notifications where order_id='normal' and kind in ('receipt','owner-booking') and status='pending'`
          ).length,
          0,
        );
      },
    );
    await t.test(
      "older in-flight refund response cannot undo a newer full refund or completed status",
      async () => {
        await createOrder("race");
        await fulfill(payment("race"));
        await sql`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,reason,square_payment_id,square_refund_id,request_key) values('race-refund','race','parent',12000,'pending','Fixture','pay-race','refund','race-refund')`;
        let release!: (value: { payment: Square.Payment }) => void;
        let ready!: () => void;
        const started = new Promise<void>((r) => {
          ready = r;
        });
        const old = deps(payment("race", 2000), "PENDING");
        old.client.payments.get = (() => {
          ready();
          return new Promise((r) => {
            release = r;
          });
        }) as unknown as typeof old.client.payments.get;
        const oldRun = syncSquareRefund("refund", old);
        await started;
        await syncSquareRefund("refund", deps(payment("race", 12000)));
        release({ payment: payment("race", 2000) });
        await oldRun;
        assert.deepEqual(await state("race"), { status: "refunded", refunded: 12000 });
        assert.equal(
          (await sql`select status from commerce_refunds where id='race-refund'`)[0].status,
          "completed",
        );
      },
    );
    await t.test(
      "wrong refund identity, currency, amount and environment cannot change local records",
      async () => {
        await createOrder("invalid");
        await fulfill(payment("invalid"));
        for (const patch of [
          { customerId: "other" },
          { locationId: "other" },
          { refundedMoney: { amount: 12000n, currency: "CAD" } },
          { refundedMoney: { amount: -1n, currency: "USD" } },
          { refundedMoney: { amount: 12001n, currency: "USD" } },
        ] as Partial<Square.Payment>[])
          await assert.rejects(
            syncSquareRefund("refund", deps({ ...payment("invalid", 12000), ...patch })),
          );
        await assert.rejects(
          syncSquareRefund("refund", {
            ...deps(payment("invalid", 12000)),
            config: { ...config, environment: "production" },
          }),
        );
        assert.deepEqual(await state("invalid"), { status: "paid", refunded: 0 });
      },
    );
  } finally {
    await db.close();
  }
});
