import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { saveParentBookingCancellation } from "./family-cancellation.server";
import { householdChangeAvailable } from "./booking-change-policy.server";

test("actual cancellation transaction preserves funds, ownership and household policy", async t => {
  const db = new PGlite();
  const wrap = (query: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (await query(parts.reduce((s,p,i) => s + (i ? `$${i}` : "") + p,""), values)).rows) as Sql;
    sql.transaction = work => db.transaction(tx => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  try {
    for (const f of (await readdir("migrations")).filter(f => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    const now = new Date("2026-10-05T18:00:00Z");
    async function booking(id: string, household: string, hours = 72, credit = false) {
      const start = new Date(+now + hours * 3600000), end = new Date(+start + 3600000);
      await sql`insert into club_households(id,primary_email) values(${household},${household + "@example.invalid"}) on conflict do nothing`;
      await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,square_payment_id,household_id)
        values(${id},${id},'parent',${household + "@example.invalid"},'s3','lesson','{"recurring":false}'::jsonb,10001,'paid','square',${"payment:" + id},${household})`;
      await sql`insert into booking_records(id,order_id,user_id,product_id,starts_at,ends_at,resources,status,household_id)
        values(${id},${id},'parent','s3',${start.toISOString()},${end.toISOString()},'[]'::jsonb,'confirmed',${household})`;
      await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${"coach:" + id},${start.toISOString()},${id})`;
      if (credit) {
        await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"renewal:" + id},${id},'sandbox',24000,'COMPLETED')`;

        await sql`insert into credit_grants(id,order_id,source_key,kind,minutes,quantity,remaining,starts_at,expires_at,household_id)
          values(${id},${id},${id},'lesson',60,4,3,${now.toISOString()},'2027-01-01T00:00:00Z',${household})`;
        await sql`update credit_grants set payment_id=${"renewal:" + id} where id=${id}`;
        await sql`insert into credit_uses(id,grant_id,booking_id,quantity) values(${id},${id},${id},1)`;
      }
    }
    const cancel = (id: string, household: string, user = "parent", role = "parent") =>
      saveParentBookingCancellation(sql,id,id,user,{role,billingHouseholdIds:[household]},now);
    await t.test("first family cancellation queues the refund, second athlete gets no refund", async () => {
      await booking("first","shared"); await booking("second","shared");
      const first = await cancel("first","shared");
      assert.equal(first.amount_cents,10001); assert.equal(first.status,"pending");
      const second = await cancel("second","shared","another-parent");
      assert.equal(second.amount_cents,0); assert.equal(second.status,"completed");
      assert.deepEqual(await sql`select status from booking_records where household_id='shared'`,[{status:"cancelled"},{status:"cancelled"}]);
      assert.equal((await sql`select * from booking_occupancy where booking_id in ('first','second')`).length,0);
      const retry = await cancel("first","shared","another-parent");
      assert.equal(retry.id,first.id); assert.equal(retry.amount_cents,10001);
      assert.equal((await sql`select * from commerce_refunds where booking_id='first'`).length,1);
    });
    await t.test("two simultaneous orders cannot both receive full refunds", async () => {
      await booking("race-one","race"); await booking("race-two","race");
      const results = await Promise.all([cancel("race-one","race"),cancel("race-two","race")]);
      assert.deepEqual(results.map(r=>r.amount_cents).sort((a,b)=>a-b),[0,10001]);
    });
    await t.test("cash rules apply at the actual confirmation time", async () => {
      for (const [hours,amount] of [[48,10001],[24,5001],[23,0]]) {
        const id="boundary-" + hours;
        await booking(id,id,hours);
        assert.equal((await cancel(id,id)).amount_cents,amount);
      }
    });
    await t.test("another household and a player login cannot cancel or retry a refund", async () => {
      await booking("private","private");
      await assert.rejects(cancel("private","intruder"), /ownership changed/);
      await assert.rejects(cancel("private","private","player","player"), /parent account/);
      assert.equal((await sql`select status from booking_records where id='private'`)[0].status,"confirmed");
      assert.equal(await householdChangeAvailable(sql,"private","new",now),true);
      await cancel("private","private");
      await assert.rejects(cancel("private","intruder"), /ownership changed/);
    });
    await t.test("credit restoration keeps expiry; allowance exhaustion forfeits later credit", async () => {
      await booking("credit-one","credits",72,true); await booking("credit-two","credits",72,true);
      await cancel("credit-one","credits"); await cancel("credit-two","credits");
      assert.deepEqual(await sql`select restored_quantity from credit_uses where id='credit-one'`,[{restored_quantity:1}]);
      assert.deepEqual(await sql`select restored_quantity from credit_uses where id='credit-two'`,[{restored_quantity:0}]);
      const [grant] = await sql<{remaining:number;expires_at:Date}>`select remaining,expires_at from credit_grants where id='credit-one'`;
      assert.equal(grant.remaining,4); assert.equal(new Date(grant.expires_at).toISOString(),"2027-01-01T00:00:00.000Z");
    });
    await t.test("half refund uses individual lesson value and original renewal card, without restoring credit", async () => {
      await booking("half-credit","half-credit",24,true);
      const r = await cancel("half-credit","half-credit");
      assert.equal(r.amount_cents,3000); assert.equal(r.status,"pending");
      assert.equal((await sql`select square_payment_id from commerce_refunds where id=${r.id}`)[0].square_payment_id,"renewal:half-credit");
      assert.equal((await sql`select remaining from credit_grants where id='half-credit'`)[0].remaining,3);
      assert.equal((await sql`select restored_quantity from credit_uses where id='half-credit'`)[0].restored_quantity,0);
      assert.equal((await cancel("half-credit","half-credit")).id,r.id);
    });
    await t.test("actual discounted base payment excludes setup and rounds the final refund once", async () => {
      await booking("discount","discount",30,true);
      await sql`update square_payments set amount_cents=20003 where id='renewal:discount'`;
      await sql`insert into square_payments(id,order_id,environment,amount_cents,status,purpose) values('setup:discount','discount','sandbox',5000,'COMPLETED','setup-fee')`;
      assert.equal((await cancel("discount","discount")).amount_cents,2500);
    });
    await t.test("missing funding or insufficient refundable balance rolls back allowance and booking", async () => {
      for (const id of ["missing-funding","spent-funding"]) {
        await booking(id,id,30,true);
        if (id === "missing-funding") await sql`update credit_grants set payment_id=null where id=${id}`;
        else await sql`update square_payments set refunded_cents=23000 where id=${"renewal:" + id}`;
        await assert.rejects(cancel(id,id), /funding requires office review/);
        assert.equal((await sql`select status from booking_records where id=${id}`)[0].status,"confirmed");
        assert.equal(await householdChangeAvailable(sql,id,"another",now),true);
      }
    });
    await t.test("pending refunds reserve funding; setup payments never qualify as lesson funding", async () => {
      await booking("reserved","reserved",30,true);
      await sql`insert into commerce_refunds(id,order_id,user_id,amount_cents,status,square_payment_id,reason) values('reserved-other','reserved','parent',22000,'pending','renewal:reserved','Other refund')`;
      await assert.rejects(cancel("reserved","reserved"), /funding requires office review/);
      await booking("wrong-purpose","wrong-purpose",30,true);
      await sql`update square_payments set purpose='setup-fee' where id='renewal:wrong-purpose'`;
      await assert.rejects(cancel("wrong-purpose","wrong-purpose"), /funding requires office review/);
    });
  } finally { await db.close(); }
});
