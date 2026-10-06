import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import {
  saveClubBookingCancellation,
  saveClubCancellationRefund,
  saveBookingReschedule,
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
