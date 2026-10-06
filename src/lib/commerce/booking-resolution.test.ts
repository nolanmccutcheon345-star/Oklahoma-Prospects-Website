import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  prepareRescheduleFee,
  completePaidReschedule,
  validatePreparedRescheduleFee,
  unfinishedRescheduleFee,
} from "./reschedule-fee.server";
import { fulfillSquarePayment } from "./square-payments.server";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import {
  saveClubBookingCancellation,
  saveClubCancellationRefund,
  saveBookingReschedule,
  bookingRescheduleQuote,
} from "./booking-resolution.server";
import { consumeHouseholdChange, householdChangeAvailable } from "./booking-change-policy.server";
test("club cancellations and free reschedules preserve funds, allowance and resource ownership", async (t) => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await query(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db)),
      now = new Date("2026-10-05T18:00:00Z");
    const parent = (id: string) => ({
      role: "parent",
      userId: "parent",
      billingHouseholdIds: [id],
    });
    const coach = { role: "coach", userId: "coach-user", billingHouseholdIds: [] };
    const admin = { role: "admin", userId: "admin", billingHouseholdIds: [] };
    async function seed(id: string, house = id, hours = 72, credit = false) {
      const start = new Date(+now + hours * 3600000),
        end = new Date(+start + 3600000);
      await sql`insert into club_households(id,primary_email) values(${house},${house + "@example.invalid"}) on conflict do nothing`;
      await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,square_payment_id,household_id) values(${id},${id},'parent',${house + "@example.invalid"},'s3','lesson','{"recurring":false}'::jsonb,12000,'paid','square',${"payment:" + id},${house})`;
      await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"payment:" + id},${id},'sandbox',${credit ? 24000 : 12000},'COMPLETED')`;
      await sql`insert into booking_records(id,order_id,user_id,coach_id,product_id,starts_at,ends_at,resources,status,household_id) values(${id},${id},'parent',${"coach:" + id},'s3',${start.toISOString()},${end.toISOString()},${JSON.stringify(["coach:" + id])}::jsonb,'confirmed',${house})`;
      await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${"coach:" + id},${start.toISOString()},${id})`;
      if (credit) {
        await sql`insert into credit_grants(id,order_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at,household_id,payment_id) values(${id},${id},${id},'lesson',60,4,3,${now.toISOString()},'2027-01-01T00:00:00Z',${house},${"payment:" + id})`;
        await sql`insert into credit_uses(id,grant_id,booking_id,quantity) values(${id},${id},${id},1)`;
      }
    }
    const staffCancel = (id: string, initiator: "coach" | "facility" = "coach") =>
      saveClubBookingCancellation(
        sql,
        id,
        initiator === "coach" ? coach : admin,
        "coach:" + id,
        initiator,
        now,
      );
    const move = (id: string, house = id, requestId = "move:" + id, available = true) =>
      saveBookingReschedule(
        sql,
        id,
        parent(house),
        { date: "2026-10-10", time: "14:00", requestId },
        async () => available,
        now,
      );
    const feeInput = () => ({ date: "2026-10-10", time: "14:00", requestId: randomUUID() });
    async function feeFor(id: string, input = feeInput()) {
      return prepareRescheduleFee(
        sql,
        id,
        { ...parent(id), email: id + "@example.invalid" },
        input,
        "sandbox",
        async () => true,
        now,
      );
    }
    async function recordFee(fee: Awaited<ReturnType<typeof feeFor>>) {
      const paymentId = "fee-payment:" + fee.id;
      await sql`insert into square_payments(id,order_id,environment,amount_cents,status,purpose) values(${paymentId},${fee.id},'sandbox',${fee.total_cents},'COMPLETED','reschedule-fee')`;
      await sql`update commerce_orders set square_payment_id=${paymentId} where id=${fee.id}`;
      return { ...fee, square_payment_id: paymentId };
    }
    await t.test(
      "reload recovery keeps unknown and expired fee payments status-only and denies foreign users",
      async () => {
        await seed("fee-reload", "fee-reload", 30);
        assert.equal(
          await unfinishedRescheduleFee(sql, "fee-reload", parent("fee-reload"), now),
          null,
        );
        const fee = await feeFor("fee-reload");
        const fresh = await unfinishedRescheduleFee(sql, "fee-reload", parent("fee-reload"), now);
        assert.equal(fresh?.fee.id, fee.id);
        assert.equal(fresh?.canPay, true);
        await sql`insert into square_payment_attempts(id,order_id,token_hash,status) values(${randomUUID()},${fee.id},'redacted-test-hash','unknown')`;
        assert.equal(
          (await unfinishedRescheduleFee(sql, "fee-reload", parent("fee-reload"), now))?.canPay,
          false,
        );
        await sql`update commerce_orders set status='expired',hold_until=${now.toISOString()} where id=${fee.id}`;
        const uncertain = await unfinishedRescheduleFee(
          sql,
          "fee-reload",
          parent("fee-reload"),
          now,
        );
        assert.equal(uncertain?.fee.id, fee.id);
        assert.equal(uncertain?.canPay, false);
        assert.equal(
          await unfinishedRescheduleFee(
            sql,
            "fee-reload",
            { ...parent("fee-reload"), userId: "another-parent" },
            now,
          ),
          null,
        );
        await assert.rejects(
          unfinishedRescheduleFee(sql, "fee-reload", parent("foreign"), now),
          /billing access/,
        );
        await assert.rejects(
          unfinishedRescheduleFee(
            sql,
            "fee-reload",
            { ...parent("fee-reload"), role: "player" },
            now,
          ),
          /billing access/,
        );
        assert.equal(await householdChangeAvailable(sql, "fee-reload", "other", now), true);
        assert.equal(
          (await sql`select id from booking_records where order_id=${fee.id}`).length,
          0,
        );
        await sql`update square_payment_attempts set status='declined' where order_id=${fee.id}`;
        assert.equal(
          await unfinishedRescheduleFee(sql, "fee-reload", parent("fee-reload"), now),
          null,
        );
      },
    );
    await t.test(
      "fee preparation binds its original booking and retry key without charging or using allowance",
      async () => {
        await seed("fee-prepare", "fee-prepare", 30, true);
        const input = feeInput();
        const fee = await feeFor("fee-prepare", input);
        assert.equal(fee.total_cents, 3000);
        assert.equal(fee.kind, "reschedule-fee");
        assert.equal((await feeFor("fee-prepare", input)).id, fee.id);
        await assert.rejects(
          feeFor("fee-prepare", { ...input, time: "15:00" }),
          /another payment or time/,
        );
        await assert.rejects(feeFor("fee-prepare"), /already exists/);
        assert.equal(
          (await sql`select id from booking_records where order_id=${fee.id}`).length,
          0,
        );
        assert.equal(
          (await sql`select id from square_payments where order_id=${fee.id}`).length,
          0,
        );
        assert.equal(await householdChangeAvailable(sql, "fee-prepare", "other", now), true);
        await assert.rejects(
          validatePreparedRescheduleFee(
            sql,
            fee.id,
            { ...parent("fee-prepare"), userId: "someone-else" },
            now,
          ),
          /no longer applies/,
        );
      },
    );
    await t.test(
      "verified fee moves only the existing lesson, preserves credits and consumes allowance once",
      async () => {
        await seed("fee-success", "fee-success", 30, true);
        const fee = await recordFee(await feeFor("fee-success"));
        const result = await sql.transaction((tx) =>
          completePaidReschedule(tx, fee, async () => true, now),
        );
        assert.equal(result.status, "paid");
        const [b] = await sql<{
          starts_at: Date;
        }>`select starts_at from booking_records where id='fee-success'`;
        assert.equal(new Date(b.starts_at).toISOString(), "2026-10-10T19:00:00.000Z");
        assert.equal(
          (await sql`select remaining from credit_grants where id='fee-success'`)[0].remaining,
          3,
        );
        assert.equal(
          (await sql`select id from booking_records where order_id=${fee.id}`).length,
          0,
        );
        assert.equal(await householdChangeAvailable(sql, "fee-success", "other", now), false);
        await sql.transaction((tx) => completePaidReschedule(tx, fee, async () => true, now));
        assert.equal(
          (
            await sql`select id from club_requests where id=${"reschedule:" + fee.snapshot.rescheduleFee.requestId}`
          ).length,
          1,
        );
      },
    );
    await t.test(
      "failed paid move rolls back occupancy and allowance and queues exactly one fee refund",
      async () => {
        for (const reason of [
          "conflict",
          "expired",
          "allowance",
          "coach",
          "price",
          "credit",
        ] as const) {
          const id = "fee-fail-" + reason;
          await seed(id, id, 30, reason === "credit");
          const fee = await recordFee(await feeFor(id));
          const old = (
            await sql<{ starts_at: Date }>`select starts_at from booking_records where id=${id}`
          )[0].starts_at;
          if (reason === "conflict") {
            await seed(id + "-block");
            await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${"coach:" + id},'2026-10-10T19:30:00Z',${id + "-block"})`;
          }
          if (reason === "expired")
            await sql`update commerce_orders set hold_until=${now.toISOString()} where id=${fee.id}`;
          if (reason === "price") {
            await sql`update square_payments set amount_cents=14000 where id=${"payment:" + id}`;
            await sql`update commerce_orders set total_cents=14000 where id=${id}`;
          }
          if (reason === "credit")
            await sql`update credit_grants set expires_at='2026-10-09T00:00:00Z' where id=${id}`;
          if (reason === "allowance")
            await consumeHouseholdChange(sql, id, "parent", "other-booking", "cancellation", now);
          const result = await sql.transaction((tx) =>
            completePaidReschedule(tx, fee, async () => reason !== "coach", now),
          );
          assert.equal(result.status, "payment_review");
          const [b] = await sql<{
            starts_at: Date;
            status: string;
          }>`select starts_at,status from booking_records where id=${id}`;
          assert.equal(+new Date(b.starts_at), +new Date(old));
          assert.equal(b.status, "confirmed");
          assert.equal(
            (await sql`select booking_id from booking_occupancy where booking_id=${id}`).length,
            1,
          );
          assert.equal(await householdChangeAvailable(sql, id, "new", now), reason !== "allowance");
          const refunds = await sql<{
            amount_cents: number;
          }>`select amount_cents from commerce_refunds where order_id=${fee.id}`;
          assert.deepEqual(refunds, [{ amount_cents: fee.total_cents }]);
          await sql.transaction((tx) => completePaidReschedule(tx, fee, async () => false, now));
          assert.equal(
            (await sql`select id from commerce_refunds where order_id=${fee.id}`).length,
            1,
          );
        }
      },
    );
    await t.test("unpaid, refunded or wrong-environment fees cannot authorize a move", async () => {
      for (const kind of ["unpaid", "refunded", "environment"] as const) {
        const id = "fee-proof-" + kind;
        await seed(id, id, 30);
        let fee = await feeFor(id);
        if (kind !== "unpaid") {
          fee = await recordFee(fee);
          if (kind === "refunded")
            await sql`update square_payments set refunded_cents=1000 where order_id=${fee.id}`;
          else
            await sql`update square_payments set environment='production' where order_id=${fee.id}`;
        }
        const result = await sql.transaction((tx) =>
          completePaidReschedule(tx, fee, async () => true, now),
        );
        assert.equal(result.status, "payment_review");
        assert.equal(await householdChangeAvailable(sql, id, "other", now), true);
        assert.equal(
          (await sql`select status from booking_records where id=${id}`)[0].status,
          "confirmed",
        );
      }
    });
    await t.test(
      "Square fulfillment of a fee bypasses ordinary booking and credit issuance",
      async () => {
        const current = new Date(Math.floor(Date.now() / 300000) * 300000);
        const id = "fee-event";
        await seed(id, id, 30);
        await sql`update booking_records set starts_at=${new Date(+current + 30 * 3600000).toISOString()},ends_at=${new Date(+current + 31 * 3600000).toISOString()},coach_id=null where id=${id}`;
        await sql`update commerce_orders set kind='cage' where id=${id}`;
        const date = new Date(+current + 5 * 86400000).toISOString().slice(0, 10);
        const fee = await prepareRescheduleFee(
          sql,
          id,
          { ...parent(id), email: id + "@example.invalid" },
          { date, time: "16:00", requestId: randomUUID() },
          "sandbox",
          async () => true,
          current,
        );
        await sql`update commerce_orders set square_customer_id='fee-customer' where id=${fee.id}`;
        const payment: Parameters<typeof fulfillSquarePayment>[1] = {
          id: "fee-event-payment",
          referenceId: fee.id,
          customerId: "fee-customer",
          locationId: "fee-location",
          sourceType: "CARD",
          status: "COMPLETED",
          amountMoney: { amount: BigInt(fee.total_cents), currency: "USD" },
          totalMoney: { amount: BigInt(fee.total_cents), currency: "USD" },
        };
        await sql.transaction((tx) =>
          fulfillSquarePayment(tx, payment, { environment: "sandbox", locationId: "fee-location" }),
        );
        assert.equal(
          (await sql`select status from commerce_orders where id=${fee.id}`)[0].status,
          "paid",
        );
        assert.equal(
          (await sql`select purpose from square_payments where order_id=${fee.id}`)[0].purpose,
          "reschedule-fee",
        );
        assert.equal((await sql`select id from credit_grants where order_id=${fee.id}`).length, 0);
        assert.equal(
          (await sql`select id from booking_records where order_id=${fee.id}`).length,
          0,
        );
        await sql.transaction((tx) =>
          fulfillSquarePayment(tx, payment, { environment: "sandbox", locationId: "fee-location" }),
        );
        assert.equal(
          (await sql`select id from square_payments where order_id=${fee.id}`).length,
          1,
        );
      },
    );
    await t.test(
      "read-only reschedule quotes apply exact notice boundaries without consuming allowance",
      async () => {
        for (const [hours, mode, fee] of [
          [48, "free", 0],
          [24, "payment_required", 6000],
          [23, "unavailable", null],
        ] as const) {
          const id = "quote-" + hours;
          await seed(id, id, hours);
          const quote = await bookingRescheduleQuote(sql, id, parent(id), now);
          assert.equal(quote.mode, mode);
          assert.equal(quote.feeCents, fee);
          assert.equal(await householdChangeAvailable(sql, id, "other", now), true);
          assert.equal(
            (await sql`select status from booking_records where id=${id}`)[0].status,
            "confirmed",
          );
        }
        assert.equal(
          (await sql`select id from commerce_refunds where booking_id like 'quote-%'`).length,
          0,
        );
      },
    );
    await t.test(
      "membership fee quotes use individual discounted renewal funding and exclude setup",
      async () => {
        await seed("quote-member", "quote-member", 30, true);
        await sql`update square_payments set amount_cents=20003 where id='payment:quote-member'`;
        const quote = await bookingRescheduleQuote(
          sql,
          "quote-member",
          parent("quote-member"),
          now,
        );
        assert.equal(quote.sessionPaidCents, 5001);
        assert.equal(quote.feeCents, 2500);
        await seed("quote-setup", "quote-setup", 30);
        await sql`update commerce_orders set total_cents=17000,square_fee_payment_id='quote-setup-fee' where id='quote-setup'`;
        await sql`insert into square_payments(id,order_id,environment,amount_cents,status,purpose) values('quote-setup-fee','quote-setup','sandbox',5000,'COMPLETED','setup-fee')`;
        const standalone = await bookingRescheduleQuote(
          sql,
          "quote-setup",
          parent("quote-setup"),
          now,
        );
        assert.equal(standalone.sessionPaidCents, 12000);
        assert.equal(standalone.feeCents, 6000);
      },
    );
    await t.test(
      "fee quote rejects players, foreign households, used allowance and unresolved funding",
      async () => {
        await seed("quote-deny", "quote-deny", 30, true);
        await assert.rejects(
          bookingRescheduleQuote(sql, "quote-deny", parent("foreign"), now),
          /parent with billing/,
        );
        await assert.rejects(
          bookingRescheduleQuote(
            sql,
            "quote-deny",
            { ...parent("quote-deny"), role: "player" },
            now,
          ),
          /parent with billing/,
        );
        await sql`update credit_grants set payment_id=null where id='quote-deny'`;
        await assert.rejects(
          bookingRescheduleQuote(sql, "quote-deny", parent("quote-deny"), now),
          /funding requires office review/,
        );
        await consumeHouseholdChange(sql, "quote-deny", "parent", "earlier", "cancellation", now);
        await assert.rejects(
          bookingRescheduleQuote(sql, "quote-deny", parent("quote-deny"), now),
          /already used/,
        );
      },
    );
    await t.test(
      "club cancellation quote remains free after a household used its allowance",
      async () => {
        await seed("quote-exempt", "quote-exempt", 12);
        await consumeHouseholdChange(sql, "quote-exempt", "parent", "earlier", "cancellation", now);
        await staffCancel("quote-exempt");
        const quote = await bookingRescheduleQuote(
          sql,
          "quote-exempt",
          parent("quote-exempt"),
          now,
        );
        assert.equal(quote.mode, "free");
        assert.equal(quote.feeCents, 0);
        assert.equal(quote.householdExempt, true);
      },
    );
    await t.test(
      "only assigned coaches or admins cancel, and only admins close facilities",
      async () => {
        await seed("scope");
        await assert.rejects(
          saveClubBookingCancellation(sql, "scope", parent("scope"), "coach:scope", "coach", now),
          /Only the assigned/,
        );
        await assert.rejects(
          saveClubBookingCancellation(sql, "scope", coach, "wrong", "coach", now),
          /Only the assigned/,
        );
        await assert.rejects(
          saveClubBookingCancellation(sql, "scope", coach, "coach:scope", "facility", now),
          /Only the assigned/,
        );
        assert.equal(
          (await sql`select status from booking_records where id='scope'`)[0].status,
          "confirmed",
        );
        await staffCancel("scope");
        await assert.rejects(
          saveClubBookingCancellation(sql, "scope", coach, "wrong", "coach", now),
          /Only the assigned/,
        );
        assert.equal(
          (await sql`select * from booking_occupancy where booking_id='scope'`).length,
          0,
        );
        assert.equal(await householdChangeAvailable(sql, "scope", "other", now), true);
      },
    );
    await t.test(
      "family chooses full cash refund even with short notice; retries use same refund",
      async () => {
        await seed("refund", "refund", 6);
        await staffCancel("refund");
        await assert.rejects(
          saveClubCancellationRefund(sql, "refund", parent("intruder")),
          /parent with billing/,
        );
        await assert.rejects(
          saveClubCancellationRefund(sql, "refund", { ...parent("refund"), role: "player" }),
          /parent with billing/,
        );
        const r = await saveClubCancellationRefund(sql, "refund", parent("refund"));
        assert.equal(r.amount_cents, 12000);
        assert.equal(r.status, "pending");
        assert.equal((await saveClubCancellationRefund(sql, "refund", parent("refund"))).id, r.id);
        await assert.rejects(move("refund"), /future confirmed/);
        assert.equal(await householdChangeAvailable(sql, "refund", "other", now), true);
      },
    );
    await t.test("membership full session refund preserves other credits", async () => {
      await seed("membership", "membership", 6, true);
      await staffCancel("membership", "facility");
      assert.equal(
        (await saveClubCancellationRefund(sql, "membership", parent("membership"))).amount_cents,
        6000,
      );
      assert.equal(
        (await sql`select remaining from credit_grants where id='membership'`)[0].remaining,
        3,
      );
      assert.equal(
        (await sql`select restored_quantity from credit_uses where id='membership'`)[0]
          .restored_quantity,
        0,
      );
    });
    await t.test(
      "club free reschedule works after household allowance used, without refund or extra credit",
      async () => {
        await seed("club-move", "club-move", 6, true);
        await sql.transaction((tx) =>
          consumeHouseholdChange(tx, "club-move", "parent", "earlier", "cancellation", now),
        );
        await staffCancel("club-move");
        await move("club-move");
        assert.equal(
          (await sql`select status from booking_records where id='club-move'`)[0].status,
          "confirmed",
        );
        assert.equal(
          (await sql`select remaining from credit_grants where id='club-move'`)[0].remaining,
          3,
        );
        assert.equal(
          (await sql`select * from commerce_refunds where booking_id='club-move'`).length,
          0,
        );
        await assert.rejects(
          saveClubCancellationRefund(sql, "club-move", parent("club-move")),
          /already been resolved/,
        );
        // A later coach cancellation of the newly scheduled session opens a fresh choice.
        await staffCancel("club-move");
        assert.equal(
          (
            await sql`select status from club_requests where id='club-booking-cancellation:club-move'`
          )[0].status,
          "pending",
        );
      },
    );
    await t.test(
      "parent free reschedule consumes shared allowance; retry cannot spend it twice",
      async () => {
        await seed("parent-one", "shared");
        await seed("parent-two", "shared");
        await move("parent-one", "shared");
        await move("parent-one", "shared");
        await assert.rejects(move("parent-two", "shared"), /already used/);
        assert.equal(
          (
            await sql`select count(*)::integer as n from club_requests where kind='booking-reschedule' and payload->>'bookingId'='parent-one'`
          )[0].n,
          1,
        );
        await assert.rejects(move("parent-one", "intruder", "different"), /parent with billing/);
      },
    );
    await t.test("conflicting resources roll back the booking time and allowance", async () => {
      await seed("collision");
      await seed("occupied");
      await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values('coach:collision','2026-10-10T19:00:00Z','occupied')`;
      const before = await sql`select starts_at from booking_records where id='collision'`;
      await assert.rejects(move("collision"), /just booked/);
      assert.deepEqual(
        await sql`select starts_at from booking_records where id='collision'`,
        before,
      );
      assert.equal(
        (
          await sql`select count(*)::integer as n from booking_occupancy where booking_id='collision'`
        )[0].n,
        1,
      );
      assert.equal(await householdChangeAvailable(sql, "collision", "other", now), true);
    });
    await t.test(
      "late parent changes, unavailable coaches and expired credits do not consume allowance",
      async () => {
        await seed("late", "late", 47);
        await assert.rejects(move("late"), /fee collection/);
        await seed("unavailable");
        await assert.rejects(
          move("unavailable", "unavailable", "move:unavailable", false),
          /unavailable/,
        );
        await seed("expired", "expired", 72, true);
        await sql`update credit_grants set expires_at='2026-10-09T20:00:00Z' where id='expired'`;
        await assert.rejects(move("expired"), /original credit period/);
        for (const id of ["late", "unavailable", "expired"])
          assert.equal(await householdChangeAvailable(sql, id, "other", now), true);
      },
    );
    await t.test(
      "full standalone-session refund includes a separately charged setup payment exactly once",
      async () => {
        await seed("setup-full");
        await sql`update commerce_orders set total_cents=17000,square_fee_payment_id='setup-payment' where id='setup-full'`;
        await sql`insert into square_payments(id,order_id,environment,amount_cents,status,purpose) values('setup-payment','setup-full','sandbox',5000,'COMPLETED','setup-fee')`;
        await staffCancel("setup-full");
        const refund = await saveClubCancellationRefund(sql, "setup-full", parent("setup-full"));
        assert.equal(refund.amount_cents, 17000);
        assert.equal(refund.refunds.length, 2);
        assert.deepEqual(
          (
            await sql<{
              square_payment_id: string;
              amount_cents: number;
            }>`select square_payment_id,amount_cents from commerce_refunds where booking_id='setup-full' order by amount_cents`
          ).map((r) => [r.square_payment_id, r.amount_cents]),
          [
            ["setup-payment", 5000],
            ["payment:setup-full", 12000],
          ],
        );
        await sql`update commerce_refunds set status='completed' where square_payment_id='payment:setup-full'`;
        const partial = await saveClubCancellationRefund(sql, "setup-full", parent("setup-full"));
        assert.equal(partial.amount_cents, 17000);
        assert.equal(partial.status, "pending");
        assert.equal(
          (await sql`select id from commerce_refunds where booking_id='setup-full'`).length,
          2,
        );
        await sql`update commerce_refunds set status='completed' where square_payment_id='setup-payment'`;
        assert.equal(
          (await saveClubCancellationRefund(sql, "setup-full", parent("setup-full"))).status,
          "completed",
        );
      },
    );
    await t.test(
      "a setup payment mismatch or existing refund rolls back the entire refund choice",
      async () => {
        for (const id of ["setup-mismatch", "setup-spent"]) {
          await seed(id);
          await sql`update commerce_orders set total_cents=17000,square_fee_payment_id=${"fee:" + id} where id=${id}`;
          await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status,purpose) values(${"fee:" + id},${id},'sandbox',${id === "setup-mismatch" ? 4000 : 5000},${id === "setup-spent" ? 1000 : 0},'COMPLETED','setup-fee')`;
          await staffCancel(id);
          await assert.rejects(saveClubCancellationRefund(sql, id, parent(id)), /office review/);
          assert.equal(
            (await sql`select id from commerce_refunds where booking_id=${id}`).length,
            0,
          );
          assert.equal(
            (
              await sql`select status from club_requests where id=${"club-booking-cancellation:" + id}`
            )[0].status,
            "pending",
          );
          assert.equal(await householdChangeAvailable(sql, id, "other", now), true);
        }
      },
    );
  } finally {
    await db.close();
  }
});
