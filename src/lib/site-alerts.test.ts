import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { deliverSiteAlerts, batchSiteAlerts, siteAlertsEnabled } from "./site-alerts.server";
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
test("site alerts preserve transaction boundaries, privacy, recipient scope and retry identity", async (t) => {
  const db = new PGlite();
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + file, "utf8"));
    const sql = wrap(db);
    assert.equal(
      (await sql`select * from site_alert_events`).length,
      0,
      "historical activity is not replayed",
    );
    await sql`insert into "user"(id,name,email,"emailVerified") values('steve','Steve','stevemccutcheon89@gmail.com',true),('nolan','Nolan','nolanmccutcheon@icloud.com',true),('stranger','Other','other@example.test',true)`;
    await sql`update owner_grants set user_id=case when email='stevemccutcheon89@gmail.com' then 'steve' else 'nolan' end`;
    await sql`delete from site_alert_events`;
    await t.test("rolled back activity never sends", async () => {
      await assert.rejects(
        sql.transaction(async (tx) => {
          await tx`insert into club_requests(id,kind,payload) values('rollback','contact','{}')`;
          throw new Error("rollback");
        }),
      );
      assert.equal((await sql`select * from site_alert_events`).length, 0);
    });
    await sql`insert into club_requests(id,kind,payload) values('tryout','tryout','{"player":"Synthetic player","age":"9U","email":"parent@example.test","notes":"PRIVATE MEDICAL DETAIL","token":"SECRET"}')`;
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values('paid','paid','parent@example.test','team','cage','{"title":"Team cage"}',12000,'paid','square','production')`;
    await sql`insert into booking_records(id,order_id,product_id,starts_at,ends_at,resources,status) values('cage','paid','team','2026-09-19T20:00:00Z','2026-09-19T21:00:00Z','["lane:1","lane:2"]','held')`;
    const attempts: { key: string; to: string[]; text: string }[] = [];
    let rejectMason = true;
    const send = (async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      attempts.push({ key: (init.headers as Record<string, string>)["Idempotency-Key"], ...body });
      return rejectMason && body.to[0] === "masonb469@icloud.com"
        ? new Response("", { status: 503 })
        : Response.json({ id: "provider-" + attempts.length });
    }) as typeof fetch;
    const config = {
      key: "fake",
      from: "test@example.test",
      origin: "https://example.test",
      production: true,
    };
    await t.test("nonproduction sends nothing and leaves queue intact", async () => {
      assert.deepEqual(await deliverSiteAlerts(sql, { ...config, production: false }, send), []);
      assert.equal(attempts.length, 0);
    });
    await deliverSiteAlerts(sql, config, send);
    assert.equal(attempts.length, 2, "held bookings never alert Mason");
    assert.ok(
      attempts.every(
        (a) => !a.text.includes("PRIVATE MEDICAL DETAIL") && !a.text.includes("SECRET"),
      ),
    );
    assert.ok(attempts.every((a) => a.text.includes("Synthetic player")));
    assert.ok(attempts.every((a) => a.to.length === 1));
    await sql`update booking_records set status='confirmed' where id='cage'`;
    await deliverSiteAlerts(sql, config, send);
    const staff = attempts.find((a) => a.to[0] === "masonb469@icloud.com")!;
    assert.ok(staff.text.includes("Lane 1") && staff.text.includes("Lane 2"));
    assert.match(staff.text, /3:00 PM CDT–4:00 PM CDT/);
    assert.ok(!staff.text.includes("Synthetic player") && !staff.text.includes("120.00"));
    rejectMason = false;
    await deliverSiteAlerts(sql, config, send);
    const staffAttempts = attempts.filter((a) => a.to[0] === "masonb469@icloud.com");
    assert.equal(staffAttempts.length, 2);
    assert.equal(staffAttempts[0].key, staffAttempts[1].key);
    const count = attempts.length;
    await deliverSiteAlerts(sql, config, send);
    assert.equal(attempts.length, count, "sent notices are not resent");
    assert.equal(
      (await sql`select * from owner_grants where email='masonb469@icloud.com'`).length,
      0,
    );
    await t.test("cancelled booking suppresses an already queued staff notice", async () => {
      await sql`update booking_records set status='held' where id='cage'`;
      await sql`update booking_records set status='confirmed' where id='cage'`;
      await batchSiteAlerts(sql, config.origin);
      await sql`update booking_records set status='cancelled' where id='cage'`;
      const start = attempts.length;
      await deliverSiteAlerts(sql, config, send);
      assert.ok(attempts.slice(start).every((a) => a.to[0] !== "masonb469@icloud.com"));
      assert.ok(
        (
          await sql`select id from site_alert_deliveries where audience='cage' and status='resolved'`
        ).length,
      );
    });
    await t.test("revoked owner cannot receive pending mail", async () => {
      await sql`insert into club_requests(id,kind,payload) values('new','contact','{}')`;
      await batchSiteAlerts(sql, config.origin);
      await sql`update owner_grants set revoked_at=now() where user_id='nolan'`;
      const start = attempts.length;
      await deliverSiteAlerts(sql, config, send);
      assert.ok(attempts.slice(start).every((a) => a.to[0] !== "nolanmccutcheon@icloud.com"));
    });
  } finally {
    await db.close();
  }
});

test("alert environment guard accepts the pinned production context and rejects previews", () => {
  assert.equal(siteAlertsEnabled("production", "production"), true);
  assert.equal(siteAlertsEnabled("deploy-preview", "production"), false);
  assert.equal(siteAlertsEnabled("production", "sandbox"), false);
  assert.equal(siteAlertsEnabled("development", "production"), false);
});
