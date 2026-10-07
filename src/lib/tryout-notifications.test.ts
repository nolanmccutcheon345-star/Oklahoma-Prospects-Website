import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { deliverTryoutNotifications, tryoutEmailAllowed } from "./tryout-notifications.server";
import { saveTryoutEventFor } from "./tryout-events.server";
import { recordInquiryFor } from "./tryout-enrollment.server";
const env = {
  TRYOUT_NOTIFICATIONS_ENABLED: "true",
  SQUARE_DEPLOY_CONTEXT: "production",
  CONTEXT: "production",
  RESEND_API_KEY: "synthetic-key",
  RESEND_FROM_EMAIL: "test@example.invalid",
};
test("tryout recipient policy blocks unknown contexts and non-allowlisted preview families", () => {
  assert.equal(tryoutEmailAllowed("family@example.invalid", env), true);
  assert.equal(tryoutEmailAllowed("family@example.invalid", { ...env, CONTEXT: "unknown" }), false);
  assert.equal(
    tryoutEmailAllowed("family@example.invalid", {
      ...env,
      SQUARE_DEPLOY_CONTEXT: "deploy-preview",
    }),
    false,
  );
  assert.equal(
    tryoutEmailAllowed("family@example.invalid", {
      ...env,
      SQUARE_DEPLOY_CONTEXT: "deploy-preview",
      TRYOUT_EMAIL_TEST_RECIPIENTS: "family@example.invalid",
    }),
    true,
  );
  assert.equal(
    tryoutEmailAllowed("family@example.invalid", { ...env, TRYOUT_NOTIFICATIONS_ENABLED: "false" }),
    false,
  );
});
test("migrated outbox retries immutable requests, recovers leases and stops expired retries", async () => {
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
    for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values('owner','owner@example.invalid','Test owner',true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values('owner','owner@example.invalid','Test owner','admin','test-family')`;
    await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
    await recordInquiryFor(sql, {
      kind: "tryout",
      requestId: randomUUID(),
      player: "Synthetic Player",
      email: "family@example.invalid",
      sport: "Baseball",
      age: "9U",
      season: "Spring 2030",
      autoEnroll: true,
    });
    await saveTryoutEventFor(sql, "owner", {
      id: randomUUID(),
      revision: 0,
      sport: "Baseball",
      season: "Spring 2030",
      ageGroups: ["9U"],
      date: "2030-04-05",
      startTime: "14:00",
      endTime: "15:00",
      location: "Test facility",
      capacity: 1,
      status: "published",
    });
    const calls: Array<{ key: string | null; body: string }> = [];
    const send: typeof fetch = async (_url, init) => {
      calls.push({
        key: new Headers(init?.headers).get("Idempotency-Key"),
        body: String(init?.body),
      });
      return new Response(JSON.stringify({ id: "synthetic-message" }), {
        status: calls.length === 1 ? 500 : 200,
      });
    };
    assert.equal(
      (
        await deliverTryoutNotifications(
          sql,
          { ...env, SQUARE_DEPLOY_CONTEXT: "deploy-preview" },
          send,
        )
      ).accepted,
      0,
    );
    assert.equal(calls.length, 0);
    assert.equal((await deliverTryoutNotifications(sql, env, send)).failed, 1);
    const [failed] = await sql`select * from tryout_notification_outbox`;
    assert.equal(failed.status, "pending");
    assert.equal(failed.attempts, 1);
    assert.ok(failed.first_attempt_at);
    assert.ok(failed.request_body);
    assert.equal((await deliverTryoutNotifications(sql, env, send)).accepted, 0);
    assert.equal(calls.length, 1);
    await sql`update tryout_notification_outbox set status='processing',lease_token='dead-worker',lease_until=now()-interval '1 minute'`;
    assert.equal((await deliverTryoutNotifications(sql, env, send)).accepted, 1);
    assert.deepEqual(calls[0], calls[1]);
    const [sent] = await sql`select * from tryout_notification_outbox`;
    assert.equal(sent.status, "sent");
    assert.equal(sent.provider_message_id, "synthetic-message");
    assert.ok(sent.accepted_at);
    assert.equal((await deliverTryoutNotifications(sql, env, send)).accepted, 0);
    assert.equal(calls.length, 2);
    await sql`update tryout_notification_outbox set status='pending',next_attempt_at=now(),first_attempt_at=now()-interval '24 hours'`;
    await deliverTryoutNotifications(sql, env, send);
    assert.equal((await sql`select status from tryout_notification_outbox`)[0].status, "review");
    assert.equal(calls.length, 2);
    await sql`update tryout_notification_outbox set status='pending',first_attempt_at=now(),attempts=8`;
    await deliverTryoutNotifications(sql, env, send);
    assert.equal((await sql`select status from tryout_notification_outbox`)[0].status, "review");
    assert.equal(calls.length, 2);
    await sql`update tryout_notification_outbox set status='pending',first_attempt_at=null,attempts=0,event_revision=event_revision-1`;
    await deliverTryoutNotifications(sql, env, send);
    assert.equal(
      (await sql`select status from tryout_notification_outbox`)[0].status,
      "superseded",
    );
    assert.equal(calls.length, 2);
  } finally {
    await db.close();
  }
});
