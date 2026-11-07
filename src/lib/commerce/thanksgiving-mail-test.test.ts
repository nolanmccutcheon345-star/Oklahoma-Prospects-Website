import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { THANKSGIVING_CAMP } from "../thanksgiving-camp";
import { reviewCampMailTest, sendCampMailTest } from "./thanksgiving-mail-test.server";

test("Sandbox camp mail review and sending enforce exact owned paid orders and isolated delivery", async (t) => {
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
    sql.transaction = (fn) =>
      db.transaction((tx) => fn(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  const sql = wrap(db.query.bind(db));
  const config = {
    environment: "sandbox" as const,
    origin: "https://sandbox.example.test",
    context: "deploy-preview",
  };
  const email = { key: "synthetic-offline-key", from: "sender@example.test" };
  const calls: { to: string[]; subject: string; text: string; key: string }[] = [];
  let failAcademy = true;
  // All provider traffic is injected and mocked. No production transport is used.
  const send: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    const body = JSON.parse(String(init?.body));
    calls.push({ ...body, key: new Headers(init?.headers).get("Idempotency-Key") });
    const fail = failAcademy && body.to.includes("prospectssportsacademy@gmail.com");
    return new Response(
      JSON.stringify(
        fail ? { error: "synthetic failure" } : { id: `synthetic-message-${calls.length}` },
      ),
      { status: fail ? 503 : 200 },
    );
  };
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    for (const [id, role] of [
      ["owner", "admin"],
      ["other-owner", "admin"],
      ["parent", "parent"],
    ]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.test"},${"PRIVATE " + id},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.test"},${id},${role},${"family-" + id})`;
      if (role === "admin")
        await sql`insert into owner_grants(email,user_id) values(${id + "@example.test"},${id})`;
    }
    const group = THANKSGIVING_CAMP.groups[0];
    await sql`insert into training_events(id,payload,updated_by) values(${group.id},'{}'::jsonb,'owner')`;
    await sql`insert into club_athletes(id,user_id,household_email,name,birth_date) values('synthetic-athlete','owner','owner@example.test','PRIVATE CHILD','2018-01-01')`;
    let serial = 0;
    async function fixture() {
      const id = `test-order-${++serial}`;
      const snapshot = {
        title: "Synthetic Thanksgiving Camp",
        eventRegistration: {
          id: group.id,
          revision: 1,
          option: "days",
          dates: ["2026-11-23"],
          sessions: [{ date: "2026-11-23", start: "09:00", end: "11:30" }],
          location: THANKSGIVING_CAMP.location,
          thanksgivingDetails: {
            parentName: "PRIVATE PARENT",
            parentPhone: "9185550101",
            sport: "Baseball",
            ageGroup: "6-9U",
          },
        },
      };
      await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment,square_payment_id,paid_at,receipt_url)
        values(${id},${id},'owner','owner@example.test','synthetic-athlete',${group.id},'event',${JSON.stringify(snapshot)}::jsonb,4500,'paid','square','sandbox',${"payment-" + id},now(),'https://squareupsandbox.com/receipt/synthetic')`;
      await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values(${"payment-" + id},${id},'sandbox',4500,'COMPLETED')`;
      await sql`insert into training_event_registrations(id,event_id,athlete_id,user_id,order_id,status) values(${"registration-" + id},${group.id},'synthetic-athlete','owner',${id},'confirmed')`;
      await sql`insert into booking_records(id,order_id,product_id,athlete_id,starts_at,ends_at,resources,status) values(${"booking-" + id},${id},${group.id},'synthetic-athlete','2026-11-23T15:00:00Z','2026-11-23T17:30:00Z','[]'::jsonb,'confirmed')`;
      for (const kind of ["receipt", "thanksgiving-registration"])
        await sql`insert into payment_notifications(id,order_id,kind) values(${kind + ":" + id},${id},${kind})`;
      return id;
    }
    await t.test(
      "review is read-only and rejects production, wrong owner and nonowner",
      async () => {
        const id = await fixture();
        const review = await reviewCampMailTest(sql, "owner", id, config);
        assert.equal(review.orderId, id);
        assert.equal(review.parentEmail, "owner@example.test");
        assert.equal(review.academyEmail, "prospectssportsacademy@gmail.com");
        assert.equal(review.totalCents, 4500);
        assert.equal(calls.length, 0);
        for (const unsafe of [
          { ...config, environment: "production" as const },
          { ...config, context: "production" },
          { ...config, context: undefined },
        ])
          await assert.rejects(sendCampMailTest(sql, "owner", id, unsafe, email, send));
        await assert.rejects(sendCampMailTest(sql, "other-owner", id, config, email, send));
        await assert.rejects(sendCampMailTest(sql, "parent", id, config, email, send));
        assert.equal(calls.length, 0);
      },
    );
    await t.test(
      "invalid financial, metadata, registration and booking states never send",
      async () => {
        const mutations: ((id: string) => Promise<unknown>)[] = [
          (id) => sql`update commerce_orders set payment_environment='production' where id=${id}`,
          (id) => sql`update commerce_orders set status='pending' where id=${id}`,
          (id) => sql`update commerce_orders set status='refunded' where id=${id}`,
          (id) =>
            sql`update commerce_orders set paid_at=now()-interval '24 hours',created_at=now()-interval '24 hours' where id=${id}`,
          (id) => sql`update commerce_orders set email='someone-else@example.test' where id=${id}`,
          (id) => sql`update commerce_orders set product_id='not-a-camp' where id=${id}`,
          (id) =>
            sql`update commerce_orders set snapshot=snapshot#-'{eventRegistration,thanksgivingDetails}' where id=${id}`,
          (id) =>
            sql`update commerce_orders set snapshot=jsonb_set(snapshot,'{eventRegistration,thanksgivingDetails,ageGroup}','"10U-14U"') where id=${id}`,
          (id) => sql`update square_payments set status='FAILED' where order_id=${id}`,
          (id) => sql`update square_payments set amount_cents=4400 where order_id=${id}`,
          (id) => sql`update square_payments set refunded_cents=100 where order_id=${id}`,
          (id) =>
            sql`update training_event_registrations set status='cancelled' where order_id=${id}`,
          (id) => sql`update booking_records set status='cancelled' where order_id=${id}`,
          (id) => sql`delete from booking_records where order_id=${id}`,
          (id) =>
            sql`delete from payment_notifications where id=${"thanksgiving-registration:" + id}`,
        ];
        for (const [index, mutate] of mutations.entries()) {
          const id = await fixture();
          await mutate(id);
          await assert.rejects(
            sendCampMailTest(sql, "owner", id, config, email, send),
            `guard ${index} must reject`,
          );
        }
        assert.equal(calls.length, 0);
      },
    );
    await t.test(
      "partial acceptance retries only pending notice with stable keys and fixed private recipients",
      async () => {
        const id = await fixture();
        const unrelated = await fixture();
        const first = await sendCampMailTest(sql, "owner", id, config, email, send);
        assert.equal(first.filter((r) => r.status === "accepted").length, 1);
        assert.equal(first.filter((r) => r.status === "pending").length, 1);
        assert.equal(calls.length, 2);
        const parent = calls.find((c) => c.to.includes("owner@example.test"))!;
        const academy = calls.find((c) => c.to.includes("prospectssportsacademy@gmail.com"))!;
        assert.deepEqual(parent.to, ["owner@example.test"]);
        assert.deepEqual(academy.to, ["prospectssportsacademy@gmail.com"]);
        for (const message of [parent, academy]) {
          assert.match(message.subject, /TEST/i);
          assert.match(message.text, /test|sandbox/i);
          assert.match(message.text, /no real money|no real.*charge/i);
          assert.match(message.text, /November 23|2026-11-23/);
          assert.match(message.text, /\$45\.00/);
        }
        assert.match(parent.text, /thanksgiving-camp#announcements/);
        assert.match(academy.text, /\/office/);
        assert.doesNotMatch(
          JSON.stringify(academy),
          /PRIVATE|9185550101|owner@example.test|synthetic-athlete|2018-01-01/,
        );
        assert.equal(parent.key, `receipt:${id}-thanksgiving-sandbox-v1`);
        assert.equal(academy.key, `thanksgiving-registration:${id}-thanksgiving-sandbox-v1`);
        failAcademy = false;
        await sendCampMailTest(sql, "owner", id, config, email, send);
        assert.equal(calls.length, 3);
        assert.equal(calls[2].key, academy.key);
        await sendCampMailTest(sql, "owner", id, config, email, send);
        assert.equal(calls.length, 3, "already accepted notices never resend");
        assert.deepEqual(
          (await sql`select distinct status from payment_notifications where order_id=${id}`).map(
            (r) => r.status,
          ),
          ["sandbox-test-accepted"],
        );
        assert.deepEqual(
          (
            await sql`select distinct status from payment_notifications where order_id=${unrelated}`
          ).map((r) => r.status),
          ["pending"],
        );
      },
    );
  } finally {
    await db.close();
  }
});
