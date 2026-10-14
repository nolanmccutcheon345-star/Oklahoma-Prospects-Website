import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import {
  centerWorkspaceFor,
  centerDetailFor,
  saveCenterWorkFor,
  saveCenterMessageFor,
  saveCenterAppointmentFor,
  saveCenterPreferencesFor,
  readCenterNoticeFor,
} from "./tryout-center.server";
import { deliverCenterNotifications } from "./tryout-center-delivery.server";
import { recordInquiryFor } from "./tryout-enrollment.server";
import { registrationRowsFor } from "./registrations.server";
import { saveTryoutEventFor } from "./tryout-events.server";
import type { CenterAppointmentInput, CenterWorkInput } from "./tryout-center-contracts";

async function fixture() {
  const db = new PGlite();
  const wrap = (q: PGlite["query"]): Sql => {
    const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
      (
        await q(
          parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows) as Sql;
    sql.query = (async (text: string, values: unknown[] = []) =>
      (await q(text, values)).rows) as Sql["query"];
    sql.transaction = (work) =>
      db.transaction((tx) => work(wrap(tx.query.bind(tx) as PGlite["query"])));
    return sql;
  };
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = wrap(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["coach", "coach"],
    ["other", "coach"],
    ["inactive", "coach"],
    ["parent", "parent"],
    ["player", "player"],
    ["fake", "admin"],
    ["coordinator", "parent"],
  ]) {
    await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${id},${id + "@example.invalid"},${id},true,now(),now())`;
    await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${role},${"fam-" + id})`;
    if (role === "coach")
      await sql`insert into club_staff(id,user_id,name,email,role,active) values(${id},${id},${id},${id + "@example.invalid"},'coach',${id !== "inactive"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into registration_readers(user_id,email,active,granted_by,can_manage_tryouts) values('coordinator','coordinator@example.invalid',true,'owner',true)`;
  return { sql, db };
}
const inquiry = (id = randomUUID(), sport = "Baseball") => ({
  requestId: id,
  kind: "tryout",
  player: "SYNTHETIC Player",
  email: "family@example.invalid",
  parent: "SYNTHETIC Guardian",
  phone: "555-0100",
  age: "13U",
  sport,
  season: "Spring 2099",
  positions: "Pitcher",
  notes: "SYNTHETIC only",
  usssaAthleteId: "123456",
  autoEnroll: false,
});
const env = {
  TRYOUT_NOTIFICATIONS_ENABLED: "true",
  SQUARE_DEPLOY_CONTEXT: "dev",
  CONTEXT: "dev",
  TRYOUT_EMAIL_TEST_RECIPIENTS:
    "coach@example.invalid,other@example.invalid,owner@example.invalid,coordinator@example.invalid,family@example.invalid",
  RESEND_API_KEY: "synthetic-not-real",
  RESEND_FROM_EMAIL: "test@example.invalid",
};
test("coach center: all sports, permission boundaries, future-only deduplicated alerts, shared contact and stale edits", async () => {
  const { sql, db } = await fixture();
  try {
    for (const id of ["parent", "player", "fake", "inactive", "missing"])
      await assert.rejects(() => centerWorkspaceFor(sql, id));
    const r = inquiry();
    await recordInquiryFor(sql, r);
    await recordInquiryFor(sql, r);
    const s = inquiry(randomUUID(), "Softball");
    await recordInquiryFor(sql, s);
    await sql`insert into club_requests(id,kind,payload) values('billing','refund-review','{"medicalNotes":"private","paymentId":"private"}'::jsonb)`;
    for (const id of ["coach", "other", "owner", "coordinator"]) {
      const workspace = await centerWorkspaceFor(sql, id);
      assert.equal(workspace.registrations.length, 2);
      assert.equal(workspace.notices.length, 2);
      assert.equal(workspace.registrations[0].payload.positions, "Pitcher");
      assert.doesNotMatch(JSON.stringify(workspace), /medicalNotes|paymentId/);
    }
    assert.equal((await registrationRowsFor(sql, "coach")).length, 2);
    await saveCenterPreferencesFor(sql, "other", {
      emailEnabled: false,
      sports: ["softball"],
      ages: [],
      teamIds: [],
    });
    await recordInquiryFor(sql, inquiry());
    assert.equal((await centerWorkspaceFor(sql, "other")).notices.length, 2);
    await recordInquiryFor(sql, inquiry(randomUUID(), "Softball"));
    assert.equal((await centerWorkspaceFor(sql, "other")).notices.length, 3);
    const work: CenterWorkInput = {
      id: r.requestId,
      revision: 0,
      assignee: "coach",
      teamId: "",
      status: "contacted",
      followUpDate: "2099-01-01",
      note: "Called guardian",
      actionId: randomUUID(),
    };
    await saveCenterWorkFor(sql, "coach", work);
    await saveCenterWorkFor(sql, "coach", work);
    await assert.rejects(
      () => saveCenterWorkFor(sql, "other", { ...work, actionId: randomUUID() }),
      /Another coach/,
    );
    await assert.rejects(
      () =>
        saveCenterWorkFor(sql, "coach", {
          ...work,
          id: "billing",
          revision: 0,
          actionId: randomUUID(),
        }),
      /not found/,
    );
    await assert.rejects(() => saveCenterWorkFor(sql, "parent", work), /access/);
    const msg = {
      id: r.requestId,
      actionId: randomUUID(),
      kind: "email" as const,
      subject: "SYNTHETIC follow-up",
      body: "SYNTHETIC message only",
    };
    await saveCenterMessageFor(sql, "coach", msg);
    await saveCenterMessageFor(sql, "coach", msg);
    await assert.rejects(
      () => saveCenterMessageFor(sql, "other", { ...msg, actionId: randomUUID() }),
      /already queued/,
    );
    assert.equal((await centerDetailFor(sql, "other", r.requestId)).delivery.length, 1);
    await saveCenterMessageFor(sql, "other", {
      ...msg,
      actionId: randomUUID(),
      kind: "family-reply",
      body: "SYNTHETIC parent replied in coach inbox",
    });
    assert.equal((await centerDetailFor(sql, "coach", r.requestId)).activity.length, 3);
    const [notice] = await sql<{
      id: string;
    }>`select id from tryout_center_notices where recipient_id='other' limit 1`;
    await readCenterNoticeFor(sql, "coach", notice.id);
    const [unread] = await sql<{
      read_at: Date | null;
    }>`select read_at from tryout_center_notices where id=${notice.id}`;
    assert.equal(unread.read_at, null);
    await readCenterNoticeFor(sql, "other", notice.id);
    await sql`update club_staff set active=false where id='coach'`;
    await assert.rejects(() => centerWorkspaceFor(sql, "coach"), /active staff/);
    await sql`update registration_readers set can_manage_tryouts=false where user_id='coordinator'`;
    await assert.rejects(() => centerWorkspaceFor(sql, "coordinator"), /access/);
  } finally {
    await db.close();
  }
});
test("appointments share real occupancy, preserve payments, enforce capacity and safely release cancelled groups", async () => {
  const { sql, db } = await fixture();
  try {
    const r = inquiry(),
      r2 = inquiry(),
      r3 = inquiry();
    r2.player = "Second Player";
    r3.player = "Third Player";
    for (const x of [r, r2, r3]) await recordInquiryFor(sql, x);
    const a: CenterAppointmentInput = {
      id: randomUUID(),
      requestId: r.requestId,
      revision: 0,
      coachId: "coach",
      eventId: "",
      date: "2099-01-05",
      time: "16:00",
      duration: 60,
      location: "Prospects facility",
      laneIds: ["1"],
      status: "confirmed",
      actionId: randomUUID(),
    };
    await saveCenterAppointmentFor(sql, "coach", a);
    await saveCenterAppointmentFor(sql, "coach", a);
    const [slots] = await sql<{
      count: number;
    }>`select count(*)::int as count from booking_occupancy`;
    assert.equal(slots.count, 24);
    assert.equal((await sql`select id from commerce_orders`).length, 0);
    await assert.rejects(
      () =>
        saveCenterAppointmentFor(sql, "other", {
          ...a,
          id: randomUUID(),
          requestId: r2.requestId,
          actionId: randomUUID(),
        }),
      /already booked/,
    );
    await assert.rejects(
      () =>
        saveCenterAppointmentFor(sql, "other", {
          ...a,
          id: randomUUID(),
          requestId: r2.requestId,
          coachId: "other",
          actionId: randomUUID(),
        }),
      /already booked/,
    );
    await assert.rejects(
      () =>
        saveCenterAppointmentFor(sql, "coach", {
          ...a,
          time: "20:00",
          revision: 1,
          actionId: randomUUID(),
        }),
      /closing/,
    );
    await assert.rejects(
      () => saveCenterAppointmentFor(sql, "coach", { ...a, revision: 0, actionId: randomUUID() }),
      /changed/,
    );
    await saveCenterAppointmentFor(sql, "coach", {
      ...a,
      revision: 1,
      status: "cancelled",
      actionId: randomUUID(),
    });
    assert.equal((await sql`select * from booking_occupancy`).length, 0);
    const event = {
      id: randomUUID(),
      revision: 0,
      sport: "Baseball" as const,
      season: "Spring 2099",
      ageGroups: ["13U"],
      date: "2099-01-05",
      startTime: "16:00",
      endTime: "17:00",
      location: "Prospects facility",
      capacity: 2,
      status: "published" as const,
    };
    await saveTryoutEventFor(sql, "owner", event);
    const group = {
      ...a,
      id: randomUUID(),
      revision: 0,
      eventId: event.id,
      actionId: randomUUID(),
    };
    await saveCenterAppointmentFor(sql, "coach", group);
    const second = { ...group, id: randomUUID(), requestId: r2.requestId, actionId: randomUUID() };
    await saveCenterAppointmentFor(sql, "other", second);
    assert.equal(
      (await sql`select * from booking_occupancy`).length,
      24,
      "same group shares reservation",
    );
    await assert.rejects(
      () =>
        saveCenterAppointmentFor(sql, "coach", {
          ...group,
          id: randomUUID(),
          requestId: r3.requestId,
          actionId: randomUUID(),
        }),
      /full/,
    );
    await assert.rejects(
      () =>
        saveTryoutEventFor(sql, "owner", {
          ...event,
          revision: 1,
          startTime: "17:00",
          endTime: "18:00",
        }),
      /confirmed coach/,
    );
    await saveCenterAppointmentFor(sql, "coach", {
      ...group,
      revision: 1,
      status: "cancelled",
      actionId: randomUUID(),
    });
    assert.equal((await sql`select * from booking_occupancy`).length, 24);
    await saveCenterAppointmentFor(sql, "coach", {
      ...second,
      revision: 1,
      status: "cancelled",
      actionId: randomUUID(),
    });
    assert.equal((await sql`select * from booking_occupancy`).length, 0);
    assert.equal((await sql`select * from tryout_enrollments where status='enrolled'`).length, 0);
  } finally {
    await db.close();
  }
});
test("email worker: isolated recipient allowlist, immutable retry, provider acceptance and review cutoff", async () => {
  const { sql, db } = await fixture();
  try {
    const r = inquiry();
    await recordInquiryFor(sql, r);
    await sql`update tryout_center_notices set status='skipped'`;
    const msg = {
      id: r.requestId,
      actionId: randomUUID(),
      kind: "email" as const,
      subject: "SYNTHETIC delivery",
      body: "SYNTHETIC email",
    };
    await saveCenterMessageFor(sql, "coach", msg);
    let attempts = 0;
    const bodies: string[] = [];
    const keys: string[] = [];
    const fake = (async (_url, init) => {
      attempts++;
      bodies.push(String(init?.body));
      keys.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
      if (attempts === 1) throw new Error("Synthetic timeout");
      return new Response(JSON.stringify({ id: "synthetic-provider-id" }));
    }) as typeof fetch;
    assert.equal(
      (await deliverCenterNotifications(sql, { ...env, TRYOUT_EMAIL_TEST_RECIPIENTS: "" }, fake))
        .accepted,
      0,
    );
    assert.equal(attempts, 0);
    assert.equal((await deliverCenterNotifications(sql, env, fake)).failed, 1);
    await sql`update tryout_center_notices set next_attempt_at=now() where id=${msg.actionId}`;
    assert.equal(
      (
        await deliverCenterNotifications(
          sql,
          { ...env, RESEND_FROM_EMAIL: "changed@example.invalid" },
          fake,
        )
      ).accepted,
      1,
    );
    assert.equal(bodies[0], bodies[1]);
    assert.equal(keys[0], keys[1]);
    assert.equal(JSON.parse(bodies[0]).reply_to, "coach@example.invalid");
    const detail = await centerDetailFor(sql, "coach", r.requestId);
    assert.equal(detail.delivery[0].status, "sent");
    await saveCenterMessageFor(sql, "coach", {
      ...msg,
      actionId: randomUUID(),
      body: "Different synthetic message",
    });
    await sql`update tryout_center_notices set first_attempt_at=now()-interval '24 hours',attempts=2 where status='pending'`;
    await deliverCenterNotifications(sql, env, fake);
    assert.equal(attempts, 2);
    assert.equal((await sql`select id from tryout_center_notices where status='review'`).length, 1);
  } finally {
    await db.close();
  }
});
