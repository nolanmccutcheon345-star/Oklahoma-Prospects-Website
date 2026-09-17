import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type Stripe from "stripe";
import type { Sql } from "../db";
import type { Quote } from "./contracts";
import { expireHolds, holdWindow } from "./store.server";
import {
  fulfillCheckout,
  processStripeEvent,
  prepareCancellation,
} from "./legacy-stripe.test-support";

function wrap(db: PGlite): Sql {
  const client = (query: PGlite["query"]): Sql => {
    const fn = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((out, p, i) => out + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    fn.query = (async (text: string, values: unknown[] = []) =>
      (await query(text, values)).rows) as Sql["query"];
    fn.transaction = (work) =>
      db.transaction((tx) => work(client(tx.query.bind(tx) as PGlite["query"])));
    return fn;
  };
  return client(db.query.bind(db));
}
const quote: Quote = {
  productId: "p1",
  kind: "package",
  title: "Package",
  totalCents: 22000,
  regularCents: 22000,
  setupCents: 0,
  recurring: false,
  assessment: false,
  duration: 30,
  sessionMinutes: 30,
  credits: 4,
  remote: 0,
  expiresDays: 120,
  discipline: "Pitching",
  resources: [],
  lines: [{ label: "Package", cents: 22000 }],
  teamRate: false,
  needsSlot: false,
};
const session = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id: `cs_test_${id}`,
    metadata: { order_id: id },
    client_reference_id: id,
    amount_total: 22000,
    currency: "usd",
    payment_status: "paid",
    customer: "cus_test_fixture",
    payment_intent: "pi_test_fixture",
    ...overrides,
  }) as unknown as Stripe.Checkout.Session;

test("payment lifecycle is transactional and rejects retries, forged amounts and stale holds", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile(`migrations/${file}`, "utf8"));
    const sql = wrap(db);
    await sql`insert into club_athletes(id,user_id,household_email,name) values('athlete','parent','fixture@example.invalid','Fixture Athlete')`;
    async function order(id: string, patch: Partial<Quote> = {}) {
      const q = { ...quote, ...patch };
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,checkout_session_id)
        values(${id},${id},'parent','fixture@example.invalid','athlete',${q.productId},${q.kind},${JSON.stringify(q)}::jsonb,${q.totalCents},now()-interval '1 hour',${`cs_test_${id}`})`;
    }
    await t.test("decline and amount/session tampering grant no credits", async () => {
      await order("unpaid");
      await sql.transaction((tx) =>
        fulfillCheckout(tx, session("unpaid", { payment_status: "unpaid" })),
      );
      await assert.rejects(
        sql.transaction((tx) => fulfillCheckout(tx, session("unpaid", { amount_total: 1 }))),
      );
      await assert.rejects(
        sql.transaction((tx) => fulfillCheckout(tx, session("unpaid", { id: "cs_test_other" }))),
      );
      assert.equal((await sql`select * from credit_grants`).length, 0);
      assert.equal(
        (await sql<{ status: string }>`select status from commerce_orders where id='unpaid'`)[0]
          .status,
        "pending",
      );
    });
    await t.test(
      "repeated successful fulfillment grants one package and never completes an assessment",
      async () => {
        await order("paid-package");
        await Promise.all([
          sql.transaction((tx) => fulfillCheckout(tx, session("paid-package"))),
          sql.transaction((tx) => fulfillCheckout(tx, session("paid-package"))),
        ]);
        const grants = await sql<{
          remaining: number;
        }>`select remaining from credit_grants where order_id='paid-package'`;
        assert.deepEqual(
          grants.map((g) => g.remaining),
          [4],
        );
        assert.equal((await sql`select * from athlete_assessments`).length, 0);
      },
    );
    await t.test(
      "expired holds release all resources; late payment goes to review without taking a new booking",
      async () => {
        await order("late");
        const start = new Date("2026-12-15T22:00:00Z"),
          end = new Date("2026-12-15T23:15:00Z");
        const original = await sql.transaction((tx) =>
          holdWindow(tx, {
            orderId: "late",
            userId: "parent",
            athleteId: "athlete",
            productId: "s1",
            start,
            end,
            resources: ["coach:fixture", "lane:1"],
          }),
        );
        await sql.transaction((tx) => expireHolds(tx));
        assert.equal(
          (await sql`select * from booking_occupancy where booking_id=${original}`).length,
          0,
        );
        const replacement = await sql.transaction((tx) =>
          holdWindow(tx, {
            orderId: null,
            userId: null,
            athleteId: null,
            productId: "s1",
            start,
            end,
            resources: ["coach:fixture", "lane:1"],
          }),
        );
        await sql.transaction((tx) => fulfillCheckout(tx, session("late")));
        assert.equal(
          (await sql<{ status: string }>`select status from commerce_orders where id='late'`)[0]
            .status,
          "payment_review",
        );
        assert.equal(
          (await sql`select * from booking_occupancy where booking_id=${replacement}`).length,
          30,
        );
        assert.equal((await sql`select * from credit_grants where order_id='late'`).length, 0);
      },
    );
    await t.test(
      "duplicate webhook ids are committed once; mismatched payment environment is rejected",
      async () => {
        await order("event");
        const stripe = {
          checkout: { sessions: { retrieve: async () => session("event") } },
        } as unknown as Stripe;
        const event = {
          id: "evt_offline_fixture",
          type: "checkout.session.completed",
          livemode: false,
          data: { object: { id: "cs_test_event" } },
        } as Stripe.Event;
        await processStripeEvent(event, { stripe, sql, mode: "test" });
        await processStripeEvent(event, { stripe, sql, mode: "test" });
        assert.equal((await sql`select * from stripe_events where id=${event.id}`).length, 1);
        assert.equal((await sql`select * from credit_grants where order_id='event'`).length, 1);
        await assert.rejects(
          processStripeEvent(
            { ...event, id: "evt_live_mismatch", livemode: true } as Stripe.Event,
            { stripe, sql, mode: "test" },
          ),
          /environment mismatch/,
        );
      },
    );
    await t.test("failed fulfillment rolls back the webhook marker for retry", async () => {
      await order("retry");
      const stripe = {
        checkout: { sessions: { retrieve: async () => session("retry", { amount_total: 1 }) } },
      } as unknown as Stripe;
      const event = {
        id: "evt_retry_fixture",
        type: "checkout.session.completed",
        livemode: false,
        data: { object: { id: "cs_test_retry" } },
      } as Stripe.Event;
      await assert.rejects(processStripeEvent(event, { stripe, sql, mode: "test" }));
      assert.equal((await sql`select * from stripe_events where id=${event.id}`).length, 0);
      assert.equal(
        (await sql<{ status: string }>`select status from commerce_orders where id='retry'`)[0]
          .status,
        "pending",
      );
    });
    await t.test(
      "cancellation is durable before provider contact and retries keep the original refund",
      async () => {
        await order("cancel", { kind: "lesson", productId: "s1", credits: 0 });
        await sql`update commerce_orders set status='paid',payment_intent_id='pi_cancel' where id='cancel'`;
        const start = new Date("2026-12-20T22:00:00Z"),
          end = new Date("2026-12-20T23:15:00Z");
        const booking = await sql.transaction((tx) =>
          holdWindow(tx, {
            orderId: "cancel",
            userId: "parent",
            athleteId: "athlete",
            productId: "s1",
            start,
            end,
            resources: ["coach:cancel"],
          }),
        );
        await sql`update booking_records set status='confirmed' where id=${booking}`;
        const intent = await sql.transaction((tx) =>
          prepareCancellation(tx, "cancel", "parent", new Date("2026-12-17T12:00:00Z")),
        );
        const retry = await sql.transaction((tx) =>
          prepareCancellation(tx, "cancel", "parent", new Date("2026-12-20T21:00:00Z")),
        );
        assert.deepEqual(retry, intent);
        assert.equal(intent.amount_cents, 22000);
        assert.equal(
          (await sql`select * from booking_occupancy where booking_id=${booking}`).length,
          0,
        );
        assert.equal(
          (
            await sql`update booking_records set status='completed' where id=${booking} and status='confirmed' returning id`
          ).length,
          0,
        );
      },
    );
    await t.test("a completed session cannot be cancelled or lose its coach earnings", async () => {
      await order("complete", { kind: "lesson", productId: "s1", credits: 0 });
      await sql`update commerce_orders set status='paid',payment_intent_id='pi_complete' where id='complete'`;
      const start = new Date("2026-12-21T22:00:00Z"),
        end = new Date("2026-12-21T23:15:00Z");
      const booking = await sql.transaction((tx) =>
        holdWindow(tx, {
          orderId: "complete",
          userId: "parent",
          athleteId: "athlete",
          productId: "s1",
          start,
          end,
          resources: ["coach:complete"],
        }),
      );
      await sql`update booking_records set status='completed' where id=${booking}`;
      await sql`insert into contractor_earnings(booking_id,coach_id,gross_cents,split_pct,amount_cents,status) values(${booking},'coach:complete',22000,60,13200,'payable')`;
      await assert.rejects(
        sql.transaction((tx) =>
          prepareCancellation(tx, "complete", "parent", new Date("2026-12-20T12:00:00Z")),
        ),
        /future confirmed/,
      );
      assert.equal(
        (
          await sql<{
            amount_cents: number;
          }>`select amount_cents from contractor_earnings where booking_id=${booking}`
        )[0].amount_cents,
        13200,
      );
      assert.equal((await sql`select * from commerce_refunds where order_id='complete'`).length, 0);
    });
  } finally {
    await db.close();
  }
});
