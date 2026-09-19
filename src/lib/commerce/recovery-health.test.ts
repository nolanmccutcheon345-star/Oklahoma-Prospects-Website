import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { recoveryHealth, recordRecoveryRun } from "./recovery-health.server";
import { squareWebhook } from "./square-webhook.server";
import { deliverPaymentNotifications } from "./square-notifications.server";

test("recovery health exposes aged work and failed runs without changing money", async (t) => {
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
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,payment_provider,payment_environment) values('old','old','fixture@example.test','team','cage','{}',12000,'square','production'),('sandbox','sandbox','fixture@example.invalid','team','cage','{}',12000,'square','sandbox')`;
    await sql`insert into square_payment_attempts(id,order_id,token_hash,status,created_at) values('old-attempt','old','fake','unknown',now()-interval '2 days'),('sandbox-attempt','sandbox','fake','unknown',now()-interval '3 days')`;
    await sql`insert into payment_notifications(id,order_id,kind,status,created_at) values('old-email','old','receipt','review',now()-interval '2 days')`;
    await t.test(
      "old attempts and reviewed mail remain visible and environment-isolated",
      async () => {
        const health = await recoveryHealth(sql, "production");
        assert.deepEqual(
          health.attempts.map((a) => a.id),
          ["old-attempt"],
        );
        assert.equal(health.queues.find((q) => q.kind === "Payment attempts")?.review, 1);
        assert.equal(health.queues.find((q) => q.kind === "Payment emails")?.review, 1);
        assert.equal(
          (await sql`select status from commerce_orders where id='old'`)[0].status,
          "pending",
        );
      },
    );
    await t.test(
      "exceptions and per-item failures cannot be reported as clean completion",
      async () => {
        await recordRecoveryRun(sql, "production", "payments", async () => ({
          failures: 0,
          eventsChecked: 3,
        }));
        const before = (await recoveryHealth(sql, "production")).jobs[0].last_success_at;
        await recordRecoveryRun(sql, "production", "payments", async () => ({
          failures: 1,
          eventsChecked: 3,
        }));
        let job = (await recoveryHealth(sql, "production")).jobs[0];
        assert.equal(job.status, "attention");
        assert.deepEqual(job.last_success_at, before);
        await assert.rejects(
          recordRecoveryRun(sql, "production", "payments", async () => {
            throw Error("fixture");
          }),
        );
        job = (await recoveryHealth(sql, "production")).jobs[0];
        assert.equal(job.status, "failed");
        assert.deepEqual(job.last_success_at, before);
      },
    );
    await t.test("an older overlapping completion cannot overwrite the newer run", async () => {
      let release!: () => void, started!: () => void;
      const ready = new Promise<void>((r) => {
        started = r;
      });
      const first = recordRecoveryRun(sql, "production", "payments", async () => {
        started();
        await new Promise<void>((r) => {
          release = r;
        });
        return { failures: 0 };
      });
      await ready;
      await recordRecoveryRun(sql, "production", "payments", async () => ({ failures: 1 }));
      release();
      await first;
      assert.equal((await recoveryHealth(sql, "production")).jobs[0].status, "attention");
    });
    await t.test(
      "signed webhook commits queued email and acknowledges without sending it",
      async () => {
        const config = {
          environment: "production" as const,
          checkoutScope: "cages" as const,
          applicationId: "app",
          locationId: "location",
          merchantId: "merchant",
          token: "fake",
          signatureKey: "fake-signature-key",
          webhookUrl: "https://example.test/api/square/webhook",
          origin: "https://example.test",
        };
        const raw = JSON.stringify({
          event_id: "event",
          merchant_id: "merchant",
          type: "payment.updated",
          data: { id: "payment" },
        });
        const signature = createHmac("sha256", config.signatureKey)
          .update(config.webhookUrl + raw)
          .digest("base64");
        const response = await squareWebhook(
          new Request(config.webhookUrl, {
            method: "POST",
            headers: { "x-square-hmacsha256-signature": signature },
            body: raw,
          }),
          {
            sql,
            config,
            process: async () => {
              await sql`insert into payment_notifications(id,order_id,kind) values('webhook-email','old','owner-booking')`;
            },
          },
        );
        assert.equal(response.status, 200);
        assert.equal(
          (await sql`select status from payment_notifications where id='webhook-email'`)[0].status,
          "pending",
        );
        const denied = await squareWebhook(
          new Request(config.webhookUrl, { method: "POST", body: raw }),
          {
            sql,
            config,
            process: async () => {
              assert.fail("invalid webhook processed");
            },
          },
        );
        assert.equal(denied.status, 403);
      },
    );
    await t.test("bounded mail batch starts independent sends and retains failures", async () => {
      await sql`delete from payment_notifications`;
      for (let i = 0; i < 5; i++)
        await sql`insert into payment_notifications(id,order_id,kind,created_at) values(${`email-${i}`},'old','receipt',now()+${i}*interval '1 second')`;
      const calls: string[] = [];
      const releases: Array<() => void> = [];
      const send = (async (_url: unknown, init: RequestInit) => {
        const id = (init.headers as Record<string, string>)["Idempotency-Key"];
        calls.push(id);
        if (calls.length < 4) await new Promise<void>((r) => releases.push(r));
        else releases.forEach((r) => r());
        return id === "email-0"
          ? new Response("", { status: 503 })
          : Response.json({ id: "provider-" + id });
      }) as typeof fetch;
      const sent = await deliverPaymentNotifications(
        sql,
        { environment: "production", origin: "https://example.test" },
        { key: "fake", from: "fixture@example.test" },
        undefined,
        send,
      );
      assert.equal(calls.length, 4);
      assert.equal(sent.length, 3);
      assert.deepEqual(
        (await sql`select id from payment_notifications where status='pending' order by id`).map(
          (r) => r.id,
        ),
        ["email-0", "email-4"],
      );
    });
  } finally {
    await db.close();
  }
});
