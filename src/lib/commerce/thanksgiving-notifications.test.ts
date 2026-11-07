import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { deliverPaymentNotifications } from "./square-notifications.server";

test("Thanksgiving notices use mocked delivery, private Steve alerts and confirmed parent sessions", async () => {
  const db = new PGlite();
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await db.query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  const calls: { to: string[]; subject: string; text: string; key: string }[] = [];
  let fail = false;
  // This injected stub is the only transport used: no real provider request or email.
  const send: typeof fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    calls.push({
      ...JSON.parse(String(options?.body)),
      key: new Headers(options?.headers).get("Idempotency-Key"),
    });
    return new Response(JSON.stringify(fail ? {} : { id: "mock-accepted" }), {
      status: fail ? 503 : 200,
    });
  };
  const config = { environment: "production" as const, origin: "https://fixture.example.test" };
  const email = { key: "offline-fixture", from: "fixture@example.test" };
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const snapshot = {
      title: "Thanksgiving Skills Camp",
      eventRegistration: {
        location: "Synthetic camp venue",
        sessions: [{ date: "2026-11-23", start: "09:00", end: "12:00" }],
        thanksgivingDetails: {
          parentName: "PRIVATE PARENT",
          parentPhone: "PRIVATE PHONE",
          sport: "Baseball",
          ageGroup: "6-9U",
        },
        childName: "PRIVATE CHILD",
        birthDate: "PRIVATE DOB",
      },
    };
    async function order(
      id: string,
      environment = "production",
      camp = true,
      status = "paid",
      address = "private-parent@example.test",
    ) {
      await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,payment_provider,payment_environment,status) values(${id},${id},${address},'camp',${camp ? "event" : "cage"},${JSON.stringify(camp ? snapshot : { title: "Cage booking" })}::jsonb,7500,'square',${environment},${status})`;
      await sql`insert into booking_records(id,order_id,product_id,starts_at,ends_at,resources,status) values(${"booking-" + id},${id},'camp','2026-11-23T15:00:00Z','2026-11-23T18:00:00Z','[]'::jsonb,'confirmed')`;
      for (const kind of ["receipt", "thanksgiving-registration"])
        await sql`insert into payment_notifications(id,order_id,kind) values(${kind + ":" + id},${id},${kind})`;
    }
    await order("confirmed");
    fail = true;
    await deliverPaymentNotifications(sql, config, email, undefined, send, "confirmed", true);
    assert.equal(
      (
        await sql`select status from payment_notifications where id='thanksgiving-registration:confirmed'`
      )[0].status,
      "pending",
    );
    fail = false;
    await deliverPaymentNotifications(sql, config, email, undefined, send, "confirmed", true);
    const alert = calls.at(-1)!;
    assert.deepEqual(alert.to, ["prospectssportsacademy@gmail.com"]);
    assert.equal(alert.key, calls[0].key);
    assert.match(alert.text, /6-9U/);
    assert.match(alert.text, /November 23, 2026/);
    assert.match(alert.text, /9:00 AM CST/);
    assert.match(alert.text, /\$75\.00/);
    assert.match(alert.text, /\/office/);
    assert.doesNotMatch(
      JSON.stringify(alert),
      /PRIVATE|private-parent|birthDate|parentPhone|Coach session/,
    );
    await deliverPaymentNotifications(sql, config, email, undefined, send, "confirmed");
    const parent = calls.at(-1)!;
    assert.deepEqual(parent.to, ["private-parent@example.test"]);
    assert.match(parent.subject, /registration confirmed/);
    assert.match(parent.text, /Synthetic camp venue/);
    assert.match(parent.text, /thanksgiving-camp#announcements/);
    assert.match(parent.text, /\$75\.00/);
    const count = calls.length;
    await deliverPaymentNotifications(sql, config, email, undefined, send, "confirmed");
    assert.equal(calls.length, count, "accepted notices do not resend");
    for (const status of ["pending", "refunded", "payment_review"]) {
      await order(status, "production", true, status);
      await deliverPaymentNotifications(sql, config, email, undefined, send, status);
    }
    assert.equal(calls.length, count, "only paid camp alerts are sent");
    await order("sandbox", "sandbox");
    await order("synthetic-sandbox", "sandbox", true, "paid", "fixture@example.invalid");
    await deliverPaymentNotifications(
      sql,
      { ...config, environment: "sandbox" },
      email,
      undefined,
      send,
    );
    assert.equal(calls.length, count, "Sandbox never emails Steve or parents");
    await order("ordinary", "production", false);
    await deliverPaymentNotifications(sql, config, email, undefined, send, "ordinary");
    assert.equal(calls.length, count + 1, "non-camp orders cannot send camp alerts");
    assert.match(calls.at(-1)!.subject, /Thank you for booking/);
    assert.doesNotMatch(calls.at(-1)!.text, /Thanksgiving|announcements/);
  } finally {
    await db.close();
  }
});
