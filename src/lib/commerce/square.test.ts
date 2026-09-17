import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { WebhooksHelper, type Square } from "square";
import type { Sql } from "../db";
import type { Quote } from "./contracts";
import { withinBookingHorizon } from "./booking-policy.server";
import { resolveSquareConfig } from "./square-config";
import { approvedProducts, addCalendarMonth } from "./catalog";
import { fulfillSquarePayment, verifiedPayment, type SquareOrder } from "./square-payments.server";
import {
  expireHolds,
  holdWindow,
  createPaidBooking,
  queueExpiredCheckoutRefunds,
  carryOneSession,
} from "./store.server";
function wrap(db: PGlite): Sql {
  const client = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((out, p, i) => out + (i ? `$${i}` : "") + p, ""),
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
const env = {
  SQUARE_ENVIRONMENT: "sandbox",
  CONTEXT: "deploy-preview",
  APP_BASE_URL: "https://preview.example.invalid",
  SQUARE_SANDBOX_APPLICATION_ID: "sandbox-sq0idp-fixture",
  SQUARE_SANDBOX_LOCATION_ID: "location",
  SQUARE_SANDBOX_MERCHANT_ID: "merchant",
  SQUARE_SANDBOX_ACCESS_TOKEN: "offline-fixture",
  SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY: "offline-signature",
  SQUARE_SANDBOX_WEBHOOK_URL: "https://preview.example.invalid/api/square/webhook",
};
test("Square credentials are isolated by context and production requires explicit acceptance", () => {
  assert.equal(resolveSquareConfig({}), null);
  assert.equal(resolveSquareConfig(env)?.environment, "sandbox");
  assert.equal(resolveSquareConfig({ ...env, SQUARE_ENVIRONMENT: "production" }), null);
  assert.equal(
    resolveSquareConfig({ ...env, SQUARE_SANDBOX_APPLICATION_ID: "production-id" }),
    null,
  );
  assert.equal(
    resolveSquareConfig({
      ...env,
      SQUARE_SANDBOX_WEBHOOK_URL: "https://other.example.invalid/api/square/webhook",
    }),
    null,
  );
  assert.equal(resolveSquareConfig({ ...env, SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY: "" }), null);
  const production = {
    ...env,
    SQUARE_ENVIRONMENT: "production",
    CONTEXT: "production",
    SQUARE_LIVE_ENABLED: "true",
    SQUARE_SANDBOX_VERIFIED: "true",
    SQUARE_PRODUCTION_APPLICATION_ID: "sq0idp-production",
    SQUARE_PRODUCTION_LOCATION_ID: "prod-location",
    SQUARE_PRODUCTION_MERCHANT_ID: "prod-merchant",
    SQUARE_PRODUCTION_ACCESS_TOKEN: "offline-prod-fixture",
    SQUARE_PRODUCTION_WEBHOOK_SIGNATURE_KEY: "offline-prod-signature",
    SQUARE_PRODUCTION_WEBHOOK_URL: env.SQUARE_SANDBOX_WEBHOOK_URL,
  };
  assert.equal(resolveSquareConfig(production)?.locationId, "prod-location");
  for (const key of ["SQUARE_LIVE_ENABLED", "SQUARE_SANDBOX_VERIFIED"])
    assert.equal(resolveSquareConfig({ ...production, [key]: "false" }), null);
  assert.equal(resolveSquareConfig({ ...production, CONTEXT: "deploy-preview" }), null);
});
test("Square verifies exact raw bytes and registered URL", async () => {
  const body = '{"event_id":"fixture","type":"payment.updated"}',
    url = "https://preview.example.invalid/api/square/webhook",
    key = "offline-fixture-only";
  const signatureHeader = createHmac("sha256", key)
    .update(url + body)
    .digest("base64");
  const input = { requestBody: body, notificationUrl: url, signatureKey: key, signatureHeader };
  assert.equal(await WebhooksHelper.verifySignature(input), true);
  assert.equal(await WebhooksHelper.verifySignature({ ...input, requestBody: body + " " }), false);
  assert.equal(
    await WebhooksHelper.verifySignature({ ...input, notificationUrl: url + "/" }),
    false,
  );
  assert.equal(
    await WebhooksHelper.verifySignature({ ...input, signatureHeader: "forged" }),
    false,
  );
});
test("approved cents override editable dollar rows; month end is calendar based", () => {
  const row = {
    id: "s9",
    kind: "lesson",
    name: "Hitting Assessment",
    price: 1,
    minutes: 60,
    credits: 0,
    remote: 0,
    expires_days: 0,
    hours: 0,
    discipline: "Hitting",
    active: true,
  };
  assert.equal(approvedProducts([row])[0].price, 150);
  assert.equal(approvedProducts([{ ...row, id: "forged" }]).length, 0);
  assert.equal(
    addCalendarMonth(new Date("2028-01-31T12:00:00Z")).toISOString(),
    "2028-02-29T12:00:00.000Z",
  );
});
test("standard and priority booking horizons enforce Chicago calendar days", () => {
  const now = new Date("2026-09-17T05:30:00Z");
  assert.equal(withinBookingHorizon("2026-09-24", 7, now), true);
  assert.equal(withinBookingHorizon("2026-09-25", 7, now), false);
  assert.equal(withinBookingHorizon("2026-10-01", 14, now), true);
  assert.equal(withinBookingHorizon("2026-10-02", 14, now), false);
  assert.equal(withinBookingHorizon("2026-09-16", 14, now), false);
});
const quote: Quote = {
  productId: "p1",
  kind: "package",
  title: "Four 30-minute sessions",
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
const payment = (id: string, cents = 22000): Square.Payment => ({
  id: "pay-" + id,
  referenceId: id,
  status: "COMPLETED",
  locationId: "location",
  customerId: "customer",
  amountMoney: { amount: BigInt(cents), currency: "USD" },
  totalMoney: { amount: BigInt(cents), currency: "USD" },
  sourceType: "CARD",
  createdAt: new Date().toISOString(),
  receiptUrl: "https://squareup.com/receipt/fixture",
});
test("Square payment fulfillment commits once and never turns unpaid holds into reservations", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = wrap(db);
    await sql`insert into club_athletes(id,user_id,household_email,name) values('athlete','parent','fixture@example.invalid','Synthetic Athlete')`;
    async function order(id: string, patch: Partial<SquareOrder["snapshot"]> = {}) {
      const q = { ...quote, ...patch };
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,hold_until,payment_provider,payment_environment,square_customer_id)
        values(${id},${id},'parent','fixture@example.invalid','athlete',${q.productId},${q.kind},${JSON.stringify(q)}::jsonb,${q.totalCents},now()+interval '10 minutes','square','sandbox','customer')`;
    }
    const config = { environment: "sandbox", locationId: "location" };
    await t.test(
      "declines and wrong amounts, currency, customer, location or environment grant nothing",
      async () => {
        await order("unpaid");
        await sql.transaction((tx) =>
          fulfillSquarePayment(tx, { ...payment("unpaid"), status: "FAILED" }, config),
        );
        for (const patch of [
          { amountMoney: { amount: 1n, currency: "USD" } },
          { amountMoney: { amount: 22000n, currency: "CAD" } },
          { customerId: "other" },
          { locationId: "other" },
          { sourceType: "CASH" },
        ] as Partial<Square.Payment>[])
          await assert.rejects(
            sql.transaction((tx) =>
              fulfillSquarePayment(tx, { ...payment("unpaid"), ...patch }, config),
            ),
          );
        await assert.rejects(
          sql.transaction((tx) =>
            fulfillSquarePayment(tx, payment("unpaid"), { ...config, environment: "production" }),
          ),
        );
        assert.equal((await sql`select id from credit_grants`).length, 0);
        assert.equal(
          (await sql<{ status: string }>`select status from commerce_orders where id='unpaid'`)[0]
            .status,
          "pending",
        );
      },
    );
    await t.test("unpaid selections create no booking; only one paid customer can take the time", async () => {
      const bookingWindow = { start: "2027-04-20T22:00:00Z", end: "2027-04-20T23:00:00Z", participantCount: 1 };
      const cage = { productId: "individual", kind: "cage", needsSlot: true, resources: ["lane:6"], credits: 0, bookingWindow };
      await order("cage-first", cage);
      await order("cage-second", cage);
      assert.equal((await sql`select id from booking_records where order_id in ('cage-first','cage-second')`).length, 0);
      await assert.rejects(sql.transaction(tx => createPaidBooking(tx, { orderId: "cage-first", userId: "parent", athleteId: null, productId: "individual", start: new Date(bookingWindow.start), end: new Date(bookingWindow.end), resources: ["lane:6"] })), /Successful payment/);
      await sql.transaction(tx => fulfillSquarePayment(tx, {...payment("cage-first"), status: "FAILED"}, config));
      assert.equal((await sql`select id from booking_records where order_id='cage-first'`).length, 0);
      await sql.transaction(tx => fulfillSquarePayment(tx, payment("cage-first"), config));
      await sql.transaction(tx => fulfillSquarePayment(tx, payment("cage-first"), config));
      assert.equal((await sql`select id from booking_records where order_id='cage-first' and status='confirmed'`).length, 1);
      await sql.transaction(tx => fulfillSquarePayment(tx, payment("cage-second"), config));
      assert.equal((await sql<{status:string}>`select status from commerce_orders where id='cage-second'`)[0].status, "payment_review");
      assert.equal((await sql`select id from booking_records where order_id='cage-second'`).length, 0);
      assert.equal((await sql`select id from commerce_refunds where order_id='cage-second' and status='pending' and amount_cents=22000`).length, 1);
      assert.equal((await sql`select id from booking_records where order_id in ('cage-first','cage-second') and status='held'`).length, 0);
    });
    await t.test("a partial membership payment does not block its selected time", async () => {
      const bookingWindow = { start: "2027-04-21T22:00:00Z", end: "2027-04-21T23:00:00Z", participantCount: 1 };
      await order("no-hold-partial", { productId: "m1", kind: "membership", recurring: true, needsSlot: true, resources: ["lane:7"], totalCents: 27900, regularCents: 22900, setupCents: 5000, assessment: true, bookingWindow });
      await sql.transaction(tx => fulfillSquarePayment(tx, payment("no-hold-partial",22900),config));
      assert.equal((await sql`select id from booking_records where order_id='no-hold-partial'`).length, 0);
      await sql.transaction(tx => fulfillSquarePayment(tx, {...payment("no-hold-partial",5000), id:"fee-no-hold"},config));
      assert.equal((await sql`select id from booking_records where order_id='no-hold-partial' and status='confirmed'`).length, 1);
    });
    await t.test(
      "duplicate confirmation grants one package with exact expiry and leaves assessment incomplete",
      async () => {
        await order("package");
        const p = payment("package");
        await sql.transaction((tx) => fulfillSquarePayment(tx, p, config));
        await sql.transaction((tx) => fulfillSquarePayment(tx, p, config));
        const [g] = await sql<{
          quantity: number;
          remaining: number;
          starts_at: Date;
          expires_at: Date;
        }>`select * from credit_grants where order_id='package'`;
        assert.equal(g.quantity, 4);
        assert.equal(g.remaining, 4);
        assert.equal(+new Date(g.expires_at) - +new Date(g.starts_at), 120 * 86400000);
        assert.equal((await sql`select * from athlete_assessments`).length, 0);
        assert.equal((await sql`select * from square_payments where order_id='package'`).length, 1);
        await assert.rejects(
          sql.transaction((tx) => fulfillSquarePayment(tx, { ...p, id: "second-charge" }, config)),
        );
      },
    );
    await t.test(
      "expired slot payment enters review and cannot displace a new holder",
      async () => {
        await order("late", { needsSlot: true });
        const start = new Date("2027-01-19T22:00:00Z"),
          end = new Date("2027-01-19T23:00:00Z");
        const old = await sql.transaction((tx) =>
          holdWindow(tx, {
            orderId: "late",
            userId: "parent",
            athleteId: "athlete",
            productId: "s3",
            start,
            end,
            resources: ["lane:1", "coach:one"],
          }),
        );
        await sql`update commerce_orders set hold_until=now()-interval '1 minute' where id='late'`;
        await sql.transaction((tx) => expireHolds(tx));
        const replacement = await sql.transaction((tx) =>
          holdWindow(tx, {
            orderId: null,
            userId: null,
            athleteId: null,
            productId: "individual",
            start,
            end,
            resources: ["lane:1"],
          }),
        );
        await sql.transaction((tx) => fulfillSquarePayment(tx, payment("late"), config));
        assert.equal(
          (await sql<{ status: string }>`select status from commerce_orders where id='late'`)[0]
            .status,
          "payment_review",
        );
        assert.equal(
          (await sql`select * from booking_occupancy where booking_id=${old}`).length,
          0,
        );
        assert.equal(
          (await sql`select * from booking_occupancy where booking_id=${replacement}`).length,
          12,
        );
        assert.equal((await sql`select * from credit_grants where order_id='late'`).length, 0);
      },
    );
    await t.test(
      "membership assessment leaves all four ordinary credits; ordinary initial lesson records its use",
      async () => {
        for (const assessed of [false, true]) {
          const id = assessed ? "assessed" : "assessment";
          const cents = assessed ? 22900 : 27900;
          await order(id, {
            productId: "m1",
            kind: "membership",
            totalCents: cents,
            regularCents: 22900,
            setupCents: assessed ? 0 : 5000,
            assessment: !assessed,
            recurring: true,
            needsSlot: true,
          });
          const start = new Date(assessed ? "2027-01-20T22:00:00Z" : "2027-01-21T22:00:00Z"),
            end = new Date(+start + 3600000);
          const b = await sql.transaction((tx) =>
            holdWindow(tx, {
              orderId: id,
              userId: "parent",
              athleteId: "athlete",
              productId: assessed ? "s2" : "s1",
              start,
              end,
              resources: ["coach:" + id],
            }),
          );
          await sql.transaction((tx) => fulfillSquarePayment(tx, payment(id, 22900), config));
          if (!assessed) {
            assert.equal(
              (await sql<{ status: string }>`select status from booking_records where id=${b}`)[0]
                .status,
              "held",
            );
            assert.equal(
              (await sql<{ status: string }>`select status from commerce_orders where id=${id}`)[0]
                .status,
              "pending_fee",
            );
            assert.equal((await sql`select * from credit_grants where order_id=${id}`).length, 0);
            await sql.transaction((tx) =>
              fulfillSquarePayment(tx, { ...payment(id, 5000), id: "fee-" + id }, config),
            );
          }
          assert.equal(
            (
              await sql<{
                remaining: number;
              }>`select remaining from credit_grants where order_id=${id} and kind='lesson'`
            )[0].remaining,
            assessed ? 3 : 4,
          );
          assert.equal(
            (await sql`select * from credit_uses where booking_id=${b}`).length,
            assessed ? 1 : 0,
          );
          assert.equal(
            (await sql<{ status: string }>`select status from booking_records where id=${b}`)[0]
              .status,
            "confirmed",
          );
        }
      },
    );
    await t.test(
      "a partially paid membership expires without booking and queues one exact refund",
      async () => {
        await order("partial", {
          productId: "m1",
          kind: "membership",
          totalCents: 27900,
          regularCents: 22900,
          setupCents: 5000,
          assessment: true,
          recurring: true,
          needsSlot: true,
        });
        const start = new Date("2027-02-01T22:00:00Z"),
          end = new Date("2027-02-01T23:15:00Z");
        const b = await sql.transaction((tx) =>
          holdWindow(tx, {
            orderId: "partial",
            userId: "parent",
            athleteId: "athlete",
            productId: "s1",
            start,
            end,
            resources: ["coach:partial"],
          }),
        );
        await assert.rejects(
          sql.transaction((tx) =>
            fulfillSquarePayment(tx, { ...payment("partial", 5000), id: "premature-fee" }, config),
          ),
        );
        await sql.transaction((tx) => fulfillSquarePayment(tx, payment("partial", 22900), config));
        await sql`update commerce_orders set hold_until=now()-interval '1 minute' where id='partial'`;
        await sql.transaction((tx) => expireHolds(tx));
        await queueExpiredCheckoutRefunds(sql, "sandbox");
        await queueExpiredCheckoutRefunds(sql, "sandbox");
        const refunds = await sql<{
          amount_cents: number;
          status: string;
        }>`select amount_cents,status from commerce_refunds where order_id='partial'`;
        assert.deepEqual(refunds, [{ amount_cents: 22900, status: "pending" }]);
        assert.equal(
          (await sql<{ status: string }>`select status from booking_records where id=${b}`)[0]
            .status,
          "expired",
        );
        assert.equal((await sql`select * from credit_grants where order_id='partial'`).length, 0);
      },
    );
    await t.test(
      "one unused review rolls once and cannot duplicate across repeated renewal delivery",
      async () => {
        await order("rollover", { productId: "m5", kind: "membership", recurring: true });
        await sql`insert into club_subscriptions(id,order_id,user_id,athlete_id,product_id,customer_id,status,amount_cents) values('sub-roll','rollover','parent','athlete','m5','customer','active',17900)`;
        await sql`insert into credit_grants(id,user_id,athlete_id,order_id,subscription_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at) values('old-review','parent','athlete','rollover','sub-roll','old-review','remote-review',20,4,2,'2027-01-01T06:00:00Z','2027-02-01T06:00:00Z')`;
        const start = new Date("2027-02-01T06:00:00Z"),
          end = new Date("2027-03-01T06:00:00Z");
        await sql.transaction((tx) => carryOneSession(tx, "sub-roll", start, end, "remote-review"));
        await sql.transaction((tx) => carryOneSession(tx, "sub-roll", start, end, "remote-review"));
        assert.equal(
          (
            await sql<{
              remaining: number;
            }>`select remaining from credit_grants where id='old-review'`
          )[0].remaining,
          1,
        );
        assert.equal(
          (
            await sql`select id from credit_grants where subscription_id='sub-roll' and rollover=true`
          ).length,
          1,
        );
        await sql.transaction((tx) =>
          carryOneSession(tx, "sub-roll", end, new Date("2027-04-01T05:00:00Z"), "remote-review"),
        );
        assert.equal(
          (
            await sql`select id from credit_grants where subscription_id='sub-roll' and rollover=true`
          ).length,
          1,
        );
      },
    );
    await t.test("payment verification requires COMPLETED and a matching immutable order", () => {
      const o = { id: "x", square_customer_id: "customer", total_cents: 22000 } as SquareOrder;
      assert.equal(verifiedPayment({ ...payment("x"), status: "APPROVED" }, o, "location"), false);
      assert.throws(() =>
        verifiedPayment({ ...payment("x"), referenceId: "other" }, o, "location"),
      );
    });
  } finally {
    await db.close();
  }
});
