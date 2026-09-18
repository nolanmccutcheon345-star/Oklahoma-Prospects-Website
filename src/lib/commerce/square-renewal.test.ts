import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Square, SquareClient } from "square";
import type { Sql } from "../db";
import { syncSquareInvoice } from "./square-webhook.server";

function wrap(db: PGlite): Sql {
  const client = (query: PGlite["query"]): Sql => {
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
      db.transaction((tx) => work(client(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  return client(db.query.bind(db));
}

test("renewal invoices require verified payment and survive duplicates and late unpaid responses", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = wrap(db);
    const quote = {
      productId: "prospect",
      kind: "cage-plan",
      recurring: true,
      credits: 2,
      remote: 0,
      regularCents: 7900,
      totalCents: 7900,
      setupCents: 0,
    };
    await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment,square_customer_id) values('renewal-order','renewal-order','parent','fixture@example.invalid','prospect','cage-plan',${JSON.stringify(quote)}::jsonb,7900,'paid','square','sandbox','customer')`;
    await sql`insert into club_subscriptions(id,order_id,user_id,product_id,customer_id,status,amount_cents,payment_provider,period_end) values('subscription','renewal-order','parent','prospect','customer','active',7900,'square','2027-10-17T05:00:00Z')`;
    let invoice: Square.Invoice = {
      id: "invoice",
      subscriptionId: "subscription",
      locationId: "location",
      orderId: "provider-order",
      primaryRecipient: { customerId: "customer" },
      status: "UNPAID",
      paymentRequests: [{ dueDate: "2027-10-17" }],
    };
    const valid: Square.Payment = {
      id: "renewal-payment",
      orderId: "provider-order",
      status: "COMPLETED",
      locationId: "location",
      customerId: "customer",
      amountMoney: { amount: 7900n, currency: "USD" },
      totalMoney: { amount: 7900n, currency: "USD" },
    };
    let payment = valid;
    const client = {
      invoices: { get: async () => ({ invoice }) },
      orders: {
        get: async () => ({
          order: { id: "provider-order", tenders: [{ paymentId: "renewal-payment" }] },
        }),
      },
      payments: { get: async () => ({ payment }) },
    } as unknown as SquareClient;
    const deps = { sql, client, config: { environment: "sandbox", locationId: "location" } };
    await t.test("unpaid invoice creates no credits or renewal receipt", async () => {
      await syncSquareInvoice("invoice", deps);
      assert.equal((await sql`select * from credit_grants`).length, 0);
      assert.equal((await sql`select * from payment_notifications`).length, 0);
    });
    await t.test("failed renewal queues one notice and grants no credits", async () => {
      await syncSquareInvoice("invoice", deps, true);
      await syncSquareInvoice("invoice", deps, true);
      assert.equal((await sql`select * from credit_grants`).length, 0);
      assert.equal(
        (await sql`select * from payment_notifications where kind='renewal-failed'`).length,
        1,
      );
    });
    invoice = { ...invoice, status: "PAID" };
    await t.test("wrong identity, price, order and refunded payment are rejected", async () => {
      for (const patch of [
        { customerId: "other" },
        { orderId: "other" },
        { locationId: "other" },
        { status: "FAILED" },
        { amountMoney: { amount: 1n, currency: "USD" } },
        { refundedMoney: { amount: 7900n, currency: "USD" } },
      ] as Partial<Square.Payment>[]) {
        payment = { ...valid, ...patch };
        await assert.rejects(syncSquareInvoice("invoice", deps), /identity mismatch/);
      }
      payment = valid;
      assert.equal((await sql`select * from credit_grants`).length, 0);
    });
    await t.test("paid invoice grants one month exactly once", async () => {
      await syncSquareInvoice("invoice", deps);
      await syncSquareInvoice("invoice", deps);
      const grants = await sql<{
        quantity: number;
        remaining: number;
      }>`select quantity,remaining from credit_grants`;
      assert.equal(grants.length, 1);
      assert.equal(grants[0].quantity, 120);
      assert.equal((await sql`select * from payment_notifications where kind='renewal'`).length, 1);
      assert.equal(
        (
          await sql<{
            status: string;
          }>`select status from payment_notifications where kind='renewal-failed'`
        )[0].status,
        "resolved",
      );
      assert.equal((await sql`select * from square_payments`).length, 1);
    });
    await t.test(
      "late unpaid response does not undo paid state or restore spent credits",
      async () => {
        await sql`update credit_grants set remaining=60`;
        invoice = { ...invoice, status: "UNPAID" };
        await syncSquareInvoice("invoice", deps, true);
        assert.equal(
          (await sql<{ status: string }>`select status from billing_invoices`)[0].status,
          "paid",
        );
        invoice = { ...invoice, status: "PAID" };
        await syncSquareInvoice("invoice", deps);
        assert.equal(
          (await sql<{ remaining: number }>`select remaining from credit_grants`)[0].remaining,
          60,
        );
        assert.equal(
          (await sql`select * from payment_notifications where status='pending'`).length,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
