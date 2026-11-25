import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import {
  adminTryoutEventsFor,
  publicTryoutEventsFor,
  saveTryoutEventFor,
  saveTryoutEventInTransaction,
} from "./tryout-events.server";
import { matchTryoutApplicants, recordInquiryFor } from "./tryout-enrollment.server";
import { tryoutEventInput, type TryoutEventInput } from "./tryout-events-contracts";
import { saveCenterAppointmentFor } from "./tryout-center.server";
import { scopedTryoutSaveInput } from "./coordinator/tryout-scheduling-contracts";

test("owner request-only publication and requests have no automatic enrollment, family notice or reservation side effects", async () => {
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
    const migrations = (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort();
    for (const name of migrations.filter((n) => n !== "0120_tryout_request_only.sql"))
      await db.exec(await readFile("migrations/" + name, "utf8"));
    const sql = wrap(db.query.bind(db));
    for (const id of ["owner", "coach", "fake-admin", "disabled", "unverified", "revoked"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt","disabledAt") values(${id},${id + "@example.invalid"},${id},${id !== "unverified"},now(),now(),${id === "disabled" ? "2026-01-01" : null})`;
      await sql`insert into profiles(user_id,email,name,role,family_id) values(${id},${id + "@example.invalid"},${id},${id === "coach" ? "coach" : "admin"},${"fam-" + id})`;
    }
    for (const id of ["owner", "disabled", "unverified", "revoked"])
      await sql`insert into owner_grants(email,user_id,revoked_at) values(${id + "@example.invalid"},${id},${id === "revoked" ? "2026-01-01" : null})`;
    const legacyId = randomUUID();
    await sql`insert into tryout_events(id,sport,season,age_groups,event_date,start_time,end_time,location,capacity,status,updated_by) values(${legacyId},'Baseball','Spring 2030',array['9U'],'2030-04-05','14:00','15:00','Test facility',1,'published','owner')`;
    await db.exec(await readFile("migrations/0120_tryout_request_only.sql", "utf8"));
    const [migrated] =
      await sql`select capacity,enrollment_mode,status from tryout_events where id=${legacyId}`;
    assert.deepEqual(migrated, { capacity: 1, enrollment_mode: "automatic", status: "published" });
    const eligible = {
      kind: "tryout",
      requestId: randomUUID(),
      player: "Legacy Waiting",
      email: "legacy@example.invalid",
      sport: "Baseball",
      age: "9U",
      season: "Spring 2030",
      autoEnroll: true,
    };
    await sql`insert into club_requests(id,kind,payload) values(${eligible.requestId},'tryout',${JSON.stringify(eligible)}::jsonb)`;
    const staffNoticeCount = async () => (await sql`select id from tryout_center_notices`).length;
    const initialStaffNotices = await staffNoticeCount();
    const event: TryoutEventInput = {
      id: randomUUID(),
      revision: 0,
      sport: "Baseball",
      season: "Spring 2030",
      ageGroups: ["9U"],
      date: "2030-04-05",
      startTime: "14:00",
      endTime: "15:00",
      location: "Test facility",
      capacity: null,
      enrollmentMode: "request-only",
      status: "draft",
    };
    const untouched = async () => {
      for (const table of [
        "tryout_enrollments",
        "tryout_notification_outbox",
        "booking_records",
        "booking_occupancy",
        "tryout_event_reservations",
        "tryout_appointments",
        "invitation_delivery",
        "fee_ready_notifications",
      ])
        assert.equal(
          (await sql.query<{ count: number }>(`select count(*)::int as count from ${table}`))[0]
            .count,
          0,
          table + " must remain empty",
        );
    };
    for (const id of ["coach", "fake-admin", "disabled", "unverified", "revoked", "unknown"]) {
      await assert.rejects(() => saveTryoutEventFor(sql, id, event));
      await assert.rejects(() =>
        sql.transaction((tx) => saveTryoutEventInTransaction(tx, id, event)),
      );
    }
    const { sport: _sport, status: _status, enrollmentMode: _mode, ...scopedFields } = event;
    const scoped = {
      ...scopedFields,
      capacity: 1,
      teamId: randomUUID(),
      coachId: randomUUID(),
      laneIds: [],
      reason: "Synthetic regression",
    };
    assert.equal(scopedTryoutSaveInput.safeParse(scoped).success, true);
    assert.equal(
      scopedTryoutSaveInput.safeParse({ ...scoped, enrollmentMode: "request-only" }).success,
      false,
    );
    assert.equal(scopedTryoutSaveInput.safeParse({ ...scoped, capacity: null }).success, false);
    await saveTryoutEventFor(sql, "owner", event);
    const current = async () =>
      (await adminTryoutEventsFor(sql, "owner")).find((e) => e.id === event.id)!;
    assert.equal((await current()).capacity, null);
    assert.equal(
      (await publicTryoutEventsFor(sql)).some((e) => e.id === event.id),
      false,
    );
    await saveTryoutEventFor(sql, "owner", { ...(await current()), status: "published" });
    const published = (await publicTryoutEventsFor(sql)).find((e) => e.id === event.id)!;
    assert.equal(published.enrollmentMode, "request-only");
    assert.equal(published.capacity, null);
    await untouched();
    await assert.rejects(
      () =>
        saveTryoutEventFor(sql, "owner", {
          ...published,
          enrollmentMode: "automatic",
          capacity: 1,
        }),
      /mode cannot change/,
    );
    const legacy = (await adminTryoutEventsFor(sql, "owner")).find((e) => e.id === legacyId)!;
    await assert.rejects(
      () =>
        saveTryoutEventFor(sql, "owner", {
          ...legacy,
          enrollmentMode: "request-only",
          capacity: null,
        }),
      /mode cannot change/,
    );
    await saveTryoutEventFor(sql, "owner", { ...published, location: "Updated test facility" });
    await assert.rejects(() => saveTryoutEventFor(sql, "owner", published), /Another editor/);
    await untouched();
    assert.equal(
      await staffNoticeCount(),
      initialStaffNotices,
      "publication and edits must not queue staff intake notices",
    );
    const request = {
      ...eligible,
      requestId: randomUUID(),
      player: "Requested Player",
      email: "request@example.invalid",
      autoEnroll: false,
      requestType: "scheduled",
      requestedEventId: event.id,
      requestConsent: true,
    };
    await recordInquiryFor(sql, request);
    await recordInquiryFor(sql, request);
    const [saved] = await sql<{
      payload: { requestedEvent: { location: string } };
      status: string;
    }>`select payload,status from club_requests where id=${request.requestId}`;
    assert.equal(
      await staffNoticeCount(),
      initialStaffNotices + 1,
      "normal owner intake alert remains, duplicate submission does not queue twice",
    );
    assert.equal(saved.status, "open");
    assert.equal(saved.payload.requestedEvent.location, "Updated test facility");
    assert.equal((await sql`select id from club_requests where id=${request.requestId}`).length, 1);
    for (const invalid of [
      { sport: "Softball" },
      { age: "14U" },
      { season: "Other" },
      { autoEnroll: true },
      { requestConsent: false },
      { requestedEventId: randomUUID() },
    ]) {
      const bad = { ...request, ...invalid, requestId: randomUUID() };
      await assert.rejects(() => recordInquiryFor(sql, bad));
      assert.equal((await sql`select id from club_requests where id=${bad.requestId}`).length, 0);
    }
    await untouched();
    await saveTryoutEventFor(sql, "owner", { ...(await current()), status: "cancelled" });
    await assert.rejects(
      () => recordInquiryFor(sql, { ...request, requestId: randomUUID() }),
      /no longer available/,
    );
    await untouched();
    await saveTryoutEventFor(sql, "owner", { ...(await current()), status: "draft" });
    await assert.rejects(
      () => recordInquiryFor(sql, { ...request, requestId: randomUUID() }),
      /no longer available/,
    );
    await saveTryoutEventFor(sql, "owner", { ...(await current()), status: "published" });
    await untouched();
    // With only the announcement eligible, the global matcher must not enroll the legacy opt-in.
    await sql`update tryout_events set status='draft' where id=${legacyId}`;
    await sql.transaction((tx) => matchTryoutApplicants(tx));
    await untouched();
    await sql`update tryout_events set status='published' where id=${legacyId}`;
    // A deliberate legacy matcher invocation still enrolls its waiting request, never the announcement.
    await sql.transaction((tx) => matchTryoutApplicants(tx));
    const enrollments = await sql<{ event_id: string }>`select event_id from tryout_enrollments`;
    assert.deepEqual(enrollments, [{ event_id: legacyId }]);
    assert.equal((await sql`select id from tryout_notification_outbox`).length, 1);
    // Even after a separately confirmed attendee exists, owner editing cannot silently notify them.
    await sql`insert into tryout_enrollments(id,event_id,request_id,applicant_key,status) values(${randomUUID()},${event.id},${request.requestId},'request-only-confirmed-test','enrolled')`;
    await assert.rejects(
      async () =>
        saveTryoutEventFor(sql, "owner", { ...(await current()), location: "Should not save" }),
      /confirmed attendees/,
    );
    assert.equal((await sql`select id from tryout_notification_outbox`).length, 1);
    await sql`delete from tryout_enrollments where applicant_key='request-only-confirmed-test'`;
    await saveTryoutEventFor(sql, "owner", {
      ...(await current()),
      location: "Synthetic external field",
    });
    await sql`insert into club_staff(id,user_id,name,email,role,active) values('coach','coach','Synthetic Coach','coach@example.invalid','coach',true)`;
    const appointment = {
      id: randomUUID(),
      requestId: request.requestId,
      revision: 0,
      coachId: "coach",
      eventId: event.id,
      date: event.date,
      time: event.startTime,
      duration: 60,
      location: "Synthetic external field",
      laneIds: [],
      status: "confirmed" as const,
      actionId: randomUUID(),
    };
    await saveCenterAppointmentFor(sql, "owner", appointment);
    await saveCenterAppointmentFor(sql, "owner", appointment);
    assert.equal(
      (await sql`select id from tryout_enrollments where event_id=${event.id}`).length,
      1,
      "deliberate manual confirmation accepts null capacity and remains idempotent",
    );
    assert.equal(
      (await sql`select event_id from tryout_event_reservations where event_id=${event.id}`).length,
      1,
    );
    assert.equal(
      (await sql`select id from tryout_notification_outbox`).length,
      2,
      "manual confirmation retains its explicit family notice",
    );
    await assert.rejects(
      async () => saveTryoutEventFor(sql, "owner", { ...(await current()), status: "cancelled" }),
      /confirmed coach\/facility/,
    );
    for (const invalid of [
      { capacity: 1 },
      { enrollmentMode: "automatic" as const, capacity: null },
      { capacity: 0 },
    ])
      assert.equal(tryoutEventInput.safeParse({ ...event, ...invalid }).success, false);
    await assert.rejects(() => sql`update tryout_events set capacity=null where id=${legacyId}`);
    assert.ok(
      (await sql`select id from audit_events where target_table='tryout_events'`).length > 0,
    );
  } finally {
    await db.close();
  }
});
