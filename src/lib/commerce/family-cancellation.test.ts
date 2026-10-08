import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { saveParentBookingCancellation } from "./family-cancellation.server";
import { settleRefundBatch } from "./refund-funding.server";
import { carryOneSession } from "./store.server";
import { householdChangeAvailable } from "./booking-change-policy.server";

test("actual cancellation transaction preserves funds, ownership and household policy", async (t) => {
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
    const sql = wrap(db.query.bind(db));
    const now = new Date("2026-10-05T18:00:00Z");
    async function booking(id: string, household: string, hours = 72, credit = false) {
      const start = new Date(+now + hours * 3600000),
        end = new Date(+start + 3600000);
      await sql`insert into club_households(id,primary_email) values(${household},${household + "@example.invalid"}) on conflict do nothing`;
      await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,square_payment_id,household_id)
        values(${id},${id},'parent',${household + "@example.invalid"},'s3','lesson','{"recurring":false}'::jsonb,10001,'paid','square',${"payment:" + id},${household})`;
      await sql`insert into booking_records(id,order_id,user_id,product_id,starts_at,ends_at,resources,status,household_id)
        values(${id},${id},'parent','s3',${start.toISOString()},${end.toISOString()},'[]'::jsonb,'confirmed',${household})`;
      await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${"coach:" + id},${start.toISOString()},${id})`;
      await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"payment:" + id},${id},'sandbox',10001,'COMPLETED')`;
      if (credit) {
        await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"renewal:" + id},${id},'sandbox',24000,'COMPLETED')`;

        await sql`insert into credit_grants(id,order_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at,household_id)
          values(${id},${id},${id},'lesson',60,4,3,${now.toISOString()},'2027-01-01T00:00:00Z',${household})`;
        await sql`update credit_grants set payment_id=${"renewal:" + id} where id=${id}`;
        await sql`insert into credit_uses(id,grant_id,booking_id,quantity) values(${id},${id},${id},1)`;
      }
    }
    const cancel = (id: string, household: string, user = "parent", role = "parent") =>
      saveParentBookingCancellation(
        sql,
        id,
        id,
        user,
        { role, billingHouseholdIds: [household] },
        now,
      );
    await t.test(
      "standalone split payments apply full/half rules to each original card and round the batch once",
      async () => {
        for (const [id, hours, expected] of [
          ["split-full", 72, 15002],
          ["split-half", 30, 7501],
        ] as const) {
          await booking(id, id, hours);
          await sql`update commerce_orders set total_cents=15002,square_fee_payment_id=${"setup:" + id} where id=${id}`;
          await sql`insert into square_payments(id,order_id,environment,amount_cents,status,purpose) values(${"setup:" + id},${id},'sandbox',5001,'COMPLETED','setup-fee')`;
          const r = await cancel(id, id);
          assert.equal(r.amount_cents, expected);
          assert.equal(r.refunds.length, 2);
          const rows = await sql<{
            square_payment_id: string;
            amount_cents: number;
          }>`select square_payment_id,amount_cents from commerce_refunds where booking_id=${id} order by square_payment_id`;
          assert.deepEqual(
            rows.map((x) => x.square_payment_id),
            ["payment:" + id, "setup:" + id],
          );
          assert.equal(
            rows.reduce((sum, x) => sum + x.amount_cents, 0),
            expected,
          );
          assert.equal(rows[0].amount_cents, hours === 72 ? 10001 : 5001);
          assert.equal(rows[1].amount_cents, hours === 72 ? 5001 : 2500);
          assert.equal((await cancel(id, id)).amount_cents, expected);
          assert.equal(
            (await sql`select id from commerce_refunds where booking_id=${id}`).length,
            2,
          );
          assert.equal(await householdChangeAvailable(sql, id, "other", now), false);
        }
      },
    );
    await t.test(
      "a partially completed provider batch retries only the unfinished refund",
      async () => {
        const r = await cancel("split-full", "split-full");
        const completed = r.refunds[0].id;
        await sql`update commerce_refunds set status='completed' where id=${completed}`;
        let retry = await cancel("split-full", "split-full");
        const calls: string[] = [];
        const result = await settleRefundBatch(sql, retry.refunds, async (id) => {
          calls.push(id);
          await sql`update commerce_refunds set status='completed' where id=${id}`;
        });
        assert.deepEqual(calls, [r.refunds[1].id]);
        assert.equal(result.status, "completed");
        assert.equal(result.amount_cents, 15002);
        retry = await cancel("split-full", "split-full");
        await settleRefundBatch(sql, retry.refunds, async () => {
          throw new Error("Must not refund again");
        });
        assert.equal(retry.status, "completed");
      },
    );
    await t.test(
      "missing, mismatched or reserved original payments roll back both cancellation and allowance",
      async () => {
        for (const kind of ["missing", "mismatch", "reserved", "wrong-order"] as const) {
          const id = "cash-funding-" + kind;
          await booking(id, id, 30);
          if (kind === "missing")
            await sql`delete from square_payments where id=${"payment:" + id}`;
          if (kind === "mismatch")
            await sql`update square_payments set amount_cents=10000 where id=${"payment:" + id}`;
          if (kind === "reserved")
            await sql`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,square_payment_id,reason) values(${"reserve:" + id},${id},'parent',9000,'pending',${"payment:" + id},'Other refund')`;
          if (kind === "wrong-order") {
            await booking(id + "-other", id + "-other", 30);
            await sql`update square_payments set order_id=${id + "-other"} where id=${"payment:" + id}`;
          }
          await assert.rejects(cancel(id, id), /Original payment requires office review/);
          assert.equal(
            (await sql`select status from booking_records where id=${id}`)[0].status,
            "confirmed",
          );
          assert.equal(
            (await sql`select id from commerce_refunds where booking_id=${id}`).length,
            0,
          );
          assert.equal(await householdChangeAvailable(sql, id, "other", now), true);
          assert.equal(
            (await sql`select booking_id from booking_occupancy where booking_id=${id}`).length,
            1,
          );
        }
      },
    );
    await t.test(
      "provider failure after one refund retains the same remaining record and monthly allowance",
      async () => {
        const r = await cancel("split-half", "split-half");
        let count = 0;
        await assert.rejects(
          settleRefundBatch(sql, r.refunds, async (id) => {
            if (++count === 2) throw new Error("Provider unavailable");
            await sql`update commerce_refunds set status='completed' where id=${id}`;
          }),
          /Provider unavailable/,
        );
        const retry = await cancel("split-half", "split-half");
        assert.equal(retry.status, "pending");
        assert.equal(retry.refunds.length, 2);
        const calls: string[] = [];
        await settleRefundBatch(sql, retry.refunds, async (id) => {
          calls.push(id);
          await sql`update commerce_refunds set status='completed' where id=${id}`;
        });
        assert.equal(calls.length, 1);
        assert.equal(
          (await sql`select id from commerce_refunds where booking_id='split-half'`).length,
          2,
        );
        assert.equal(await householdChangeAvailable(sql, "split-half", "other", now), false);
      },
    );
    await t.test(
      "first family cancellation queues the refund, second athlete gets no refund",
      async () => {
        await booking("first", "shared");
        await booking("second", "shared");
        const first = await cancel("first", "shared");
        assert.equal(first.amount_cents, 10001);
        assert.equal(first.status, "pending");
        const second = await cancel("second", "shared", "another-parent");
        assert.equal(second.amount_cents, 0);
        assert.equal(second.status, "completed");
        assert.deepEqual(
          await sql`select status from booking_records where household_id='shared'`,
          [{ status: "cancelled" }, { status: "cancelled" }],
        );
        assert.equal(
          (await sql`select * from booking_occupancy where booking_id in ('first','second')`)
            .length,
          0,
        );
        const retry = await cancel("first", "shared", "another-parent");
        assert.equal(retry.id, first.id);
        assert.equal(retry.amount_cents, 10001);
        assert.equal(
          (await sql`select * from commerce_refunds where booking_id='first'`).length,
          1,
        );
      },
    );
    await t.test("two simultaneous orders cannot both receive full refunds", async () => {
      await booking("race-one", "race");
      await booking("race-two", "race");
      const results = await Promise.all([cancel("race-one", "race"), cancel("race-two", "race")]);
      assert.deepEqual(
        results.map((r) => r.amount_cents).sort((a, b) => a - b),
        [0, 10001],
      );
    });
    await t.test("cash rules apply at the actual confirmation time", async () => {
      for (const [hours, amount] of [
        [48, 10001],
        [24, 5001],
        [23, 0],
      ]) {
        const id = "boundary-" + hours;
        await booking(id, id, hours);
        assert.equal((await cancel(id, id)).amount_cents, amount);
      }
    });
    await t.test(
      "another household and a player login cannot cancel or retry a refund",
      async () => {
        await booking("private", "private");
        await assert.rejects(cancel("private", "intruder"), /ownership changed/);
        await assert.rejects(cancel("private", "private", "player", "player"), /parent account/);
        assert.equal(
          (await sql`select status from booking_records where id='private'`)[0].status,
          "confirmed",
        );
        assert.equal(await householdChangeAvailable(sql, "private", "new", now), true);
        await cancel("private", "private");
        await assert.rejects(cancel("private", "intruder"), /ownership changed/);
      },
    );
    await t.test(
      "credit restoration keeps expiry; allowance exhaustion forfeits later credit",
      async () => {
        await booking("credit-one", "credits", 72, true);
        await booking("credit-two", "credits", 72, true);
        await cancel("credit-one", "credits");
        await cancel("credit-two", "credits");
        assert.deepEqual(
          await sql`select restored_quantity from credit_uses where id='credit-one'`,
          [{ restored_quantity: 1 }],
        );
        assert.deepEqual(
          await sql`select restored_quantity from credit_uses where id='credit-two'`,
          [{ restored_quantity: 0 }],
        );
        const [grant] = await sql<{
          remaining: number;
          expires_at: Date;
        }>`select remaining,expires_at from credit_grants where id='credit-one'`;
        assert.equal(grant.remaining, 4);
        assert.equal(new Date(grant.expires_at).toISOString(), "2027-01-01T00:00:00.000Z");
      },
    );
    await t.test(
      "half refund uses individual lesson value and original renewal card, without restoring credit",
      async () => {
        await booking("half-credit", "half-credit", 24, true);
        const r = await cancel("half-credit", "half-credit");
        assert.equal(r.amount_cents, 3000);
        assert.equal(r.status, "pending");
        assert.equal(
          (await sql`select square_payment_id from commerce_refunds where id=${r.id}`)[0]
            .square_payment_id,
          "renewal:half-credit",
        );
        assert.equal(
          (await sql`select remaining from credit_grants where id='half-credit'`)[0].remaining,
          3,
        );
        assert.equal(
          (await sql`select restored_quantity from credit_uses where id='half-credit'`)[0]
            .restored_quantity,
          0,
        );
        assert.equal((await cancel("half-credit", "half-credit")).id, r.id);
      },
    );
    await t.test(
      "actual discounted base payment excludes setup and rounds the final refund once",
      async () => {
        await booking("discount", "discount", 30, true);
        await sql`update square_payments set amount_cents=20003 where id='renewal:discount'`;
        await sql`insert into square_payments(id,order_id,environment,amount_cents,status,purpose) values('setup:discount','discount','sandbox',5000,'COMPLETED','setup-fee')`;
        assert.equal((await cancel("discount", "discount")).amount_cents, 2500);
      },
    );
    await t.test(
      "missing funding or insufficient refundable balance rolls back allowance and booking",
      async () => {
        for (const id of ["missing-funding", "spent-funding"]) {
          await booking(id, id, 30, true);
          if (id === "missing-funding")
            await sql`update credit_grants set payment_id=null where id=${id}`;
          else
            await sql`update square_payments set refunded_cents=23000 where id=${"renewal:" + id}`;
          await assert.rejects(cancel(id, id), /funding requires office review/);
          assert.equal(
            (await sql`select status from booking_records where id=${id}`)[0].status,
            "confirmed",
          );
          assert.equal(await householdChangeAvailable(sql, id, "another", now), true);
        }
      },
    );
    await t.test(
      "pending refunds reserve funding; setup payments never qualify as lesson funding",
      async () => {
        await booking("reserved", "reserved", 30, true);
        await sql`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,square_payment_id,reason) values('reserved-other','reserved','parent',22000,'pending','renewal:reserved','Other refund')`;
        await assert.rejects(cancel("reserved", "reserved"), /funding requires office review/);
        await booking("wrong-purpose", "wrong-purpose", 30, true);
        await sql`update square_payments set purpose='setup-fee' where id='renewal:wrong-purpose'`;
        await assert.rejects(
          cancel("wrong-purpose", "wrong-purpose"),
          /funding requires office review/,
        );
      },
    );
    await t.test(
      "a newly issued rollover retains its original payment and per-lesson denominator",
      async () => {
        await booking("rollover", "rollover", 800, true);
        await sql`insert into club_subscriptions(id,order_id,product_id,customer_id,status,amount_cents) values('roll-sub','rollover','m1','customer','active',24000)`;
        await sql`delete from credit_uses where booking_id='rollover'`;
        await sql`update credit_grants set subscription_id='roll-sub',remaining=2,expires_at='2026-11-01T05:00:00Z' where id='rollover'`;
        await sql.transaction((tx) =>
          carryOneSession(
            tx,
            "roll-sub",
            new Date("2026-11-01T05:00:00Z"),
            new Date("2026-12-01T06:00:00Z"),
          ),
        );
        const [grant] = await sql<{
          id: string;
          payment_id: string;
          quantity: number;
        }>`select id,payment_id,quantity from credit_grants where subscription_id='roll-sub' and rollover=true`;
        assert.equal(grant.payment_id, "renewal:rollover");
        assert.equal(grant.quantity, 1);
        await sql`update credit_grants set remaining=0 where id=${grant.id}`;
        await sql`insert into credit_uses(id,grant_id,booking_id,quantity) values('rolled-use',${grant.id},'rollover',1)`;
        const [b] = await sql<{
          starts_at: Date;
        }>`select starts_at from booking_records where id='rollover'`;
        const confirm = new Date(new Date(b.starts_at).getTime() - 30 * 3600000);
        const result = await saveParentBookingCancellation(
          sql,
          "rollover",
          "rollover",
          "parent",
          { role: "parent", billingHouseholdIds: ["rollover"] },
          confirm,
        );
        assert.equal(result.amount_cents, 3000); // Half of $240 / four, not half of $240 / one.
        assert.equal(
          (await sql`select square_payment_id from commerce_refunds where id=${result.id}`)[0]
            .square_payment_id,
          "renewal:rollover",
        );
      },
    );
    await t.test(
      "legacy rollover without recorded provenance and unallocated package bookings require review",
      async () => {
        await booking("legacy-roll", "legacy-roll", 30, true);
        await sql`update credit_grants set rollover=true where id='legacy-roll'`;
        await assert.rejects(
          cancel("legacy-roll", "legacy-roll"),
          /funding requires office review/,
        );
        await booking("package-initial", "package-initial", 72);
        await sql`update commerce_orders set kind='package' where id='package-initial'`;
        await assert.rejects(cancel("package-initial", "package-initial"), /office refund review/);
        for (const id of ["legacy-roll", "package-initial"])
          assert.equal(await householdChangeAvailable(sql, id, "other", now), true);
      },
    );
  } finally {
    await db.close();
  }
});
