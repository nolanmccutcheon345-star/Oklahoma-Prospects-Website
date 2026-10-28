import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Square } from "square";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { emptyDevelopment } from "../pd/empty";
import { resolveIdentity } from "../identity.server";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "../finance/basis.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
import {
  organizationBookings,
  saveOrganizationBookingOperation,
  saveOrganizationEventSessionOperation,
} from "./organization-bookings.server";
import {
  organizationEvents,
  createOperationalEvent,
  saveOperationalEventSettings,
  addOperationalEventSession,
  saveOperationalEventEnrollment,
  publicOperationalEvents,
} from "./organization-events.server";
import {
  eventFamily,
  listTrainingEvents,
  prepareEventCheckout,
  saveTrainingEvent,
  validateEventPayment,
} from "../training-events.server";
import { fulfillSquarePayment, type SquareOrder } from "../commerce/square-payments.server";
import { operationalEventSessionKey } from "../commerce/operational-schedule.server";
import type { TrainingEvent } from "../training-events-contracts";
const db = new PGlite();
after(() => db.close());
function adapter(query: PGlite["query"], nested = false): Sql {
  const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
    (
      await query(
        p.reduce((s, x, i) => s + (i ? "$" + i : "") + x, ""),
        v,
      )
    ).rows) as Sql;
  sql.query = (async (s: string, v: unknown[] = []) => (await query(s, v)).rows) as Sql["query"];
  sql.transaction = (fn) => {
    assert.equal(nested, false);
    return db.transaction((tx) => fn(adapter(tx.query.bind(tx) as PGlite["query"], true)));
  };
  return sql;
}
async function fixture(active = true) {
  await db.exec("drop schema public cascade;create schema public");
  for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["sara", "parent"],
    ["parent", "parent"],
    ["outsider", "parent"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${id})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const me = await resolveIdentity(sql, "parent");
  for (const id of ["athlete", "other-athlete"])
    await sql`insert into club_athletes(id,user_id,household_email,name,household_id,birth_date) values(${id},'parent','parent@example.invalid',${"Synthetic " + id},${me.billingHouseholdIds[0]},'2012-01-01')`;
  const file = emptyDevelopment();
  file.coaches = [
    {
      id: "coach",
      name: "Coach",
      email: "coach@example.invalid",
      active: true,
      specialties: ["Pitching"],
    },
  ];
  file.availability = [
    { id: "available", coachId: "coach", weekday: "Monday", window: "09:00-21:00" },
  ];
  file.coachPayouts = [{ id: "payout", coachId: "coach", serviceId: "s3", splitPct: 41 }];
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify(file)})`;
  await sql`insert into club_staff(id,name,email,role,active) values('staff','Coach','coach@example.invalid','coach',true)`;
  await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','s3',41)`;
  await sql`insert into commerce_orders(id,request_key,user_id,email,athlete_id,product_id,kind,snapshot,total_cents,status,hold_until,payment_provider,payment_environment,square_payment_id,paid_at) values('lesson-order','lesson-order','parent','parent@example.invalid','athlete','s3','lesson','{"kind":"lesson","title":"Synthetic lesson","totalCents":10000}'::jsonb,10000,'paid','2030-01-01','square','production','lesson-payment',now())`;
  await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values('lesson-payment','lesson-order','production',10000,'COMPLETED')`;
  await sql`insert into booking_records(id,order_id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status,participants_verified) values('lesson','lesson-order','parent','athlete','coach','s3','2030-01-07T22:00:00Z','2030-01-07T23:00:00Z','["lane:fixture","coach:coach","athlete:athlete"]'::jsonb,'confirmed',true)`;
  await sql`insert into booking_participants(booking_id,athlete_id) values('lesson','athlete')`;
  for (const resource of ["lane:fixture", "coach:coach", "athlete:athlete"])
    for (let n = 0; n < 12; n++)
      await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${resource},${new Date(Date.parse("2030-01-07T22:00:00Z") + n * 300000).toISOString()},'lesson')`;
  const p = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    sourceClubRevision: p.sourceClubRevision,
    sourceDigest: p.sourceDigest,
    reason: "Synthetic lifecycle isolation fixture",
  });
  if (active) await applyFutureActiveSchemaForTest(sql);
  return { sql, me };
}
async function finances(sql: Sql) {
  const tables = [
    "commerce_orders",
    "square_payments",
    "commerce_refunds",
    "credit_grants",
    "credit_uses",
    "contractor_earnings",
    "financial_basis_state",
    "financial_basis_versions",
    "financial_lesson_bindings",
  ];
  const result: Record<string, unknown> = {};
  for (const t of tables)
    result[t] = await sql.query(`select to_jsonb(t) as row from ${t} t order by to_jsonb(t)::text`);
  result.bookings =
    await sql`select to_jsonb(b) as row from booking_records b where order_id is not null order by id`;
  return result;
}
async function operation(
  sql: Sql,
  action: "reschedule" | "cancel" | "restore" | "check-in",
  extra = {},
) {
  const b = (await organizationBookings(sql, "owner")).bookings.find((b) => b.id === "lesson")!;
  return {
    bookingId: b.id,
    revision: b.revision,
    expectedStartsAt: b.startsAt,
    expectedEndsAt: b.endsAt,
    action,
    reason: "Synthetic schedule adjustment",
    ...extra,
  };
}
async function camp(sql: Sql, status: "published" | "draft" = "published") {
  const e: TrainingEvent = {
    id: randomUUID(),
    revision: 0,
    name: status === "draft" ? "PRIVATE-FINANCE-CANARY" : "Synthetic camp",
    description:
      status === "draft"
        ? "PRIVATE-FINANCE-CANARY confidential budget"
        : "Public synthetic camp description",
    type: "camp",
    sport: "Both",
    location: status === "draft" ? "PRIVATE-FINANCE-CANARY location" : "Facility",
    priceCents: 7500,
    capacity: 10,
    coachIds: ["coach"],
    status,
    policy: "Synthetic accepted policy",
    sessions: [{ date: "2030-01-09", start: "16:00", end: "17:00" }],
  };
  return saveTrainingEvent(sql, "owner", e, [{ id: "coach", name: "Coach" }]);
}
async function pending(sql: Sql, e: TrainingEvent) {
  const p = await prepareEventCheckout(
    sql,
    "parent",
    {
      eventId: e.id,
      revision: e.revision,
      athleteId: "athlete",
      requestId: randomUUID(),
      consent: true,
    },
    "production",
  );
  await sql`update commerce_orders set square_customer_id='customer' where id=${p.orderId}`;
  return (await sql<SquareOrder>`select * from commerce_orders where id=${p.orderId}`)[0];
}
async function pay(sql: Sql, o: SquareOrder) {
  const p: Square.Payment = {
    id: "pay-" + o.id,
    referenceId: o.id,
    locationId: "loc",
    customerId: "customer",
    amountMoney: { amount: BigInt(o.total_cents), currency: "USD" },
    totalMoney: { amount: BigInt(o.total_cents), currency: "USD" },
    status: "COMPLETED",
    sourceType: "CARD",
    createdAt: new Date().toISOString(),
  };
  for (let i = 0; i < 2; i++)
    await sql.transaction((tx) =>
      fulfillSquarePayment(tx, p, { environment: "production", locationId: "loc" }),
    );
}
test("booking operational move/cancel/restore preserves original financial rows and rejects stale writes", async () => {
  const { sql } = await fixture(),
    before = await finances(sql),
    old = await operation(sql, "reschedule", { date: "2030-01-07", time: "17:00" });
  await saveOrganizationBookingOperation(sql, "owner", old);
  assert.equal(
    (await organizationBookings(sql, "owner")).bookings[0].startsAt,
    "2030-01-07T23:00:00.000Z",
  );
  await assert.rejects(saveOrganizationBookingOperation(sql, "owner", old), /changed/);
  await saveOrganizationBookingOperation(sql, "owner", await operation(sql, "cancel"));
  assert.equal((await sql`select * from booking_occupancy where booking_id='lesson'`).length, 0);
  await saveOrganizationBookingOperation(sql, "owner", await operation(sql, "restore"));
  assert.equal((await sql`select * from booking_occupancy where booking_id='lesson'`).length, 36);
  assert.deepEqual(await finances(sql), before);
});
test("conflict rollback, actual current authorization and strict no-financial request fields", async () => {
  const { sql } = await fixture();
  await sql`insert into booking_records(id,product_id,starts_at,ends_at,resources,status) values('conflict','practice','2030-01-07T23:00Z','2030-01-08T00:00Z','["lane:fixture"]'::jsonb,'confirmed')`;
  await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values('lane:fixture','2030-01-07T23:00Z','conflict')`;
  const cells = await sql`select * from booking_occupancy order by resource_id,slot_at`,
    v = await operation(sql, "reschedule", { date: "2030-01-07", time: "17:00" });
  await assert.rejects(saveOrganizationBookingOperation(sql, "owner", v), /conflict/);
  assert.deepEqual(await sql`select * from booking_occupancy order by resource_id,slot_at`, cells);
  assert.equal((await sql`select * from operational_booking_changes`).length, 0);
  await assert.rejects(
    saveOrganizationBookingOperation(sql, "outsider", v),
    /access|required|permission/i,
  );
  await assert.rejects(
    saveOrganizationBookingOperation(sql, "owner", { ...v, totalCents: 0 } as typeof v),
    /unrecognized/i,
  );
  await assert.rejects(saveOrganizationBookingOperation(sql, "sara", v), /not authorized/i);
  await sql`update "user" set "disabledAt"=now() where id='owner'`;
  await assert.rejects(saveOrganizationBookingOperation(sql, "owner", v), /disabled|access/i);
});
test("captured mode retains financial coupling blocker", async () => {
  const { sql } = await fixture(false);
  assert.equal((await organizationBookings(sql, "owner")).canAdjust, false);
  await assert.rejects(
    saveOrganizationBookingOperation(sql, "owner", await operation(sql, "cancel")),
    /cutover/,
  );
});
test("whole camp reschedule preserves pending order, verifies payment exactly once, and exposes effective delivery", async () => {
  const { sql, me } = await fixture(),
    e = await camp(sql),
    o = await pending(sql, e),
    key = operationalEventSessionKey(e.id, e.sessions[0]);
  const before = await finances(sql);
  await saveOrganizationEventSessionOperation(sql, "owner", {
    eventId: e.id,
    sessionKey: key,
    revision: 0,
    action: "reschedule",
    date: "2030-01-10",
    start: "16:00",
    end: "17:00",
    location: "New facility",
    reason: "Weather schedule adjustment",
  });
  assert.deepEqual(await finances(sql), before);
  await sql.transaction((tx) => validateEventPayment(tx, o, me));
  await pay(sql, o);
  const [b] = await sql<{
    starts_at: Date;
    id: string;
  }>`select id,starts_at from booking_records where order_id=${o.id}`;
  assert.equal(new Date(b.starts_at).toISOString(), "2030-01-09T22:00:00.000Z");
  assert.equal(
    (await sql`select * from training_event_registrations where order_id=${o.id}`).length,
    1,
  );
  assert.equal(
    (
      await sql`select * from booking_occupancy where booking_id=${b.id} and slot_at='2030-01-10T22:00Z'`
    ).length,
    1,
  );
  assert.equal(
    (await eventFamily(sql, "parent")).registrations[0].operationalSessions[0].date,
    "2030-01-10",
  );
  assert.equal((await listTrainingEvents(sql))[0].operationalSessions[0].date, "2030-01-10");
});
test("camp operational cancellation does not reject pending payment or create refund; legacy tuple alias resolves", async () => {
  const { sql, me } = await fixture(),
    e = await camp(sql),
    o = await pending(sql, e);
  delete o.snapshot.eventRegistration!.sessionKeys;
  await sql`update commerce_orders set snapshot=${JSON.stringify(o.snapshot)}::jsonb where id=${o.id}`;
  await saveOrganizationEventSessionOperation(sql, "owner", {
    eventId: e.id,
    sessionKey: operationalEventSessionKey(e.id, e.sessions[0]),
    revision: 0,
    action: "cancel",
    reason: "Weather delivery cancellation",
  });
  await sql.transaction((tx) => validateEventPayment(tx, o, me));
  await pay(sql, o);
  assert.equal((await sql`select * from commerce_refunds`).length, 0);
  assert.equal(
    (await sql`select * from booking_records where order_id=${o.id} and status='confirmed'`).length,
    1,
  );
  assert.equal(
    (
      await sql`select * from operational_booking_schedule where order_id=${o.id} and status='cancelled'`
    ).length,
    1,
  );
  assert.equal(
    (await eventFamily(sql, "parent")).registrations[0].operationalSessions[0].status,
    "cancelled",
  );
  assert.equal(
    (
      await sql`select * from booking_occupancy where booking_id in(select id from booking_records where order_id=${o.id})`
    ).length,
    0,
  );
});
const draft = () => ({
  requestId: randomUUID(),
  name: "Unpriced camp",
  description: "Synthetic operational camp draft",
  type: "camp" as const,
  sport: "Both" as const,
  location: "Facility",
  capacity: 1,
  coachIds: ["coach"],
  reason: "Create operational event",
});
test("unpriced create/edit/add session/manual enroll/archive remains finance neutral; retry payload is bound", async () => {
  const { sql } = await fixture(false),
    before = await finances(sql),
    v = draft();
  const created = await createOperationalEvent(sql, "owner", v);
  await createOperationalEvent(sql, "owner", v);
  await assert.rejects(
    createOperationalEvent(sql, "owner", { ...v, name: "Changed retry" }),
    /request|changed/i,
  );
  const id = created.id;
  await addOperationalEventSession(sql, "owner", {
    eventId: id,
    revision: 1,
    date: "2030-01-09",
    start: "16:00",
    end: "17:00",
    location: "Facility",
    reason: "Add training session",
  });
  await saveOperationalEventSettings(sql, "owner", {
    eventId: id,
    revision: 2,
    capacity: 1,
    coachIds: ["coach"],
    publication: "open",
    name: "Renamed public camp",
    reason: "Open manual enrollment",
  });
  const session = (await organizationEvents(sql, "owner")).events.find((e) => e.id === id)!
    .sessions[0];
  const enrollment = {
    eventId: id,
    sessionKey: session.sessionKey,
    sessionRevision: session.revision,
    athleteId: "athlete",
    revision: 0,
    action: "enroll" as const,
    reason: "Enroll synthetic athlete",
  };
  await saveOperationalEventEnrollment(sql, "owner", enrollment);
  await assert.rejects(
    saveOperationalEventEnrollment(sql, "owner", { ...enrollment, athleteId: "other-athlete" }),
    /capacity|full/i,
  );
  assert.equal((await publicOperationalEvents(sql))[0].name, "Renamed public camp");
  assert.equal((await eventFamily(sql, "parent")).operationalEnrollments.length, 1);
  await saveOperationalEventEnrollment(sql, "owner", {
    ...enrollment,
    revision: 1,
    action: "unenroll",
  });
  await saveOperationalEventSettings(sql, "owner", {
    eventId: id,
    revision: 3,
    capacity: 1,
    coachIds: ["coach"],
    publication: "archived",
    reason: "Archive finished listing",
  });
  assert.equal((await publicOperationalEvents(sql)).length, 0);
  assert.equal((await sql`select * from training_events`).length, 0);
  assert.deepEqual(await finances(sql), before);
});
test("private commercial draft copy is withheld including session metadata; operational opening cannot enable checkout", async () => {
  const { sql } = await fixture(),
    e = await camp(sql, "draft");
  await sql`update training_events set payload=jsonb_set(payload,'{sessions,0,location}','"PRIVATE-FINANCE-CANARY nested"'::jsonb) where id=${e.id}`;
  let events = await organizationEvents(sql, "owner");
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE-FINANCE-CANARY/);
  await saveOperationalEventSettings(sql, "owner", {
    eventId: e.id,
    revision: 0,
    capacity: 5,
    coachIds: ["coach"],
    publication: "open",
    reason: "Open safe manual enrollment",
  });
  events = await organizationEvents(sql, "owner");
  assert.doesNotMatch(JSON.stringify(events), /PRIVATE-FINANCE-CANARY/);
  const session = events.events.find((x) => x.id === e.id)!.sessions[0];
  await saveOperationalEventEnrollment(sql, "owner", {
    eventId: e.id,
    sessionKey: session.sessionKey,
    sessionRevision: session.revision,
    athleteId: "athlete",
    revision: 0,
    action: "enroll",
    reason: "Manual safe enrollment",
  });
  assert.doesNotMatch(JSON.stringify(await eventFamily(sql, "parent")), /PRIVATE-FINANCE-CANARY/);
  assert.equal((await listTrainingEvents(sql)).length, 0);
  assert.equal((await publicOperationalEvents(sql)).length, 0);
  await assert.rejects(pending(sql, e), /closed/);
});

test("operational check-in requires a current waiver and leaves original financial check-in untouched", async () => {
  const { sql } = await fixture();
  const start = new Date(Math.floor(Date.now() / 300000) * 300000),
    end = new Date(+start + 3600000);
  await sql`insert into operational_booking_changes(booking_id,revision,starts_at,ends_at,status,reason,updated_by,source_kind) values('lesson',1,${start.toISOString()},${end.toISOString()},'confirmed','Synthetic current delivery fixture','sara','operator')`;
  const before = await finances(sql);
  await assert.rejects(
    saveOrganizationBookingOperation(sql, "owner", await operation(sql, "check-in")),
    /waiver/,
  );
  await sql`insert into club_waivers(id,user_id,athlete_id,version,signer_name,signed_at,consent_text) values('waiver','parent','athlete','fixture','Synthetic Parent',now(),'Synthetic consent')`;
  await saveOrganizationBookingOperation(sql, "owner", await operation(sql, "check-in"));
  assert.ok(
    (await organizationBookings(sql, "owner")).bookings.find((b) => b.id === "lesson")!.checkedInAt,
  );
  assert.deepEqual(await finances(sql), before);
});
test("paid camp staffing/capacity/archive/additional sessions preserve pending checkout and original purchased sessions", async () => {
  const { sql, me } = await fixture(),
    e = await camp(sql),
    o = await pending(sql, e),
    before = await finances(sql);
  await saveOperationalEventSettings(sql, "owner", {
    eventId: e.id,
    revision: 0,
    capacity: 1,
    coachIds: ["coach"],
    publication: "archived",
    reason: "Close new enrollment only",
  });
  await addOperationalEventSession(sql, "owner", {
    eventId: e.id,
    revision: 1,
    date: "2030-01-11",
    start: "16:00",
    end: "17:00",
    location: "Facility",
    reason: "Add separate operational session",
  });
  assert.deepEqual(await finances(sql), before);
  await assert.rejects(
    prepareEventCheckout(
      sql,
      "parent",
      {
        eventId: e.id,
        revision: e.revision,
        athleteId: "other-athlete",
        requestId: randomUUID(),
        consent: true,
      },
      "production",
    ),
    /closed/,
  );
  await sql.transaction((tx) => validateEventPayment(tx, o, me));
  await pay(sql, o);
  assert.equal((await sql`select * from booking_records where order_id=${o.id}`).length, 1);
  assert.equal((await eventFamily(sql, "parent")).registrations[0].operationalSessions.length, 1);
  assert.equal(
    (await organizationEvents(sql, "owner")).events.find((x) => x.id === e.id)!.sessions.length,
    2,
  );
});
test("additional session enrollment follows repeated group moves and checked-in delivery blocks changes", async () => {
  const { sql } = await fixture(false),
    v = draft(),
    { id } = await createOperationalEvent(sql, "owner", v),
    key = operationalEventSessionKey(id, { date: "2030-01-09", start: "16:00", end: "17:00" });
  await addOperationalEventSession(sql, "owner", {
    eventId: id,
    revision: 1,
    date: "2030-01-09",
    start: "16:00",
    end: "17:00",
    location: "Facility",
    reason: "Add operational session",
  });
  await saveOperationalEventSettings(sql, "owner", {
    eventId: id,
    revision: 2,
    capacity: 2,
    coachIds: ["coach"],
    publication: "open",
    reason: "Open office enrollment",
  });
  await saveOrganizationEventSessionOperation(sql, "owner", {
    eventId: id,
    sessionKey: key,
    revision: 1,
    action: "reschedule",
    date: "2030-01-10",
    start: "16:00",
    end: "17:00",
    location: "Facility",
    reason: "First group schedule adjustment",
  });
  await saveOperationalEventEnrollment(sql, "owner", {
    eventId: id,
    sessionKey: key,
    sessionRevision: 2,
    athleteId: "athlete",
    revision: 0,
    action: "enroll",
    reason: "Office enrollment after move",
  });
  const before = await finances(sql);
  await saveOrganizationEventSessionOperation(sql, "owner", {
    eventId: id,
    sessionKey: key,
    revision: 2,
    action: "reschedule",
    date: "2030-01-11",
    start: "16:00",
    end: "17:00",
    location: "Facility",
    reason: "Second group schedule adjustment",
  });
  assert.equal(
    (await eventFamily(sql, "parent")).operationalEnrollments[0].startsAt,
    "2030-01-11T22:00:00.000Z",
  );
  assert.deepEqual(await finances(sql), before);
  await sql`update operational_booking_changes set checked_in_at=now() where booking_id in(select booking_id from operational_event_enrollments where event_id=${id})`;
  await assert.rejects(
    saveOrganizationEventSessionOperation(sql, "owner", {
      eventId: id,
      sessionKey: key,
      revision: 3,
      action: "cancel",
      reason: "Try cancellation after check-in",
    }),
    /check/i,
  );
});
test("pending and unknown checkout athletes reserve group-move occupancy without altering financial orders", async () => {
  const { sql } = await fixture(),
    e = await camp(sql),
    o = await pending(sql, e);
  await sql`insert into square_payment_attempts(id,order_id,token_hash,status) values('attempt',${o.id},'synthetic','unknown')`;
  await sql`update commerce_orders set hold_until=now()-interval '1 hour',status='payment_review' where id=${o.id}`;
  await sql`insert into booking_records(id,product_id,starts_at,ends_at,resources,status) values('conflict','practice','2030-01-10T22:00Z','2030-01-10T23:00Z','["athlete:athlete"]'::jsonb,'confirmed')`;
  await sql`insert into booking_occupancy(resource_id,slot_at,booking_id) values('athlete:athlete','2030-01-10T22:00Z','conflict')`;
  const before = await finances(sql);
  await assert.rejects(
    saveOrganizationEventSessionOperation(sql, "owner", {
      eventId: e.id,
      sessionKey: operationalEventSessionKey(e.id, e.sessions[0]),
      revision: 0,
      action: "reschedule",
      date: "2030-01-10",
      start: "16:00",
      end: "17:00",
      location: "Facility",
      reason: "Move while payment unresolved",
    }),
    /checkout|conflict/,
  );
  assert.deepEqual(await finances(sql), before);
  assert.equal(
    (await sql`select * from operational_event_sessions where event_id=${e.id}`).length,
    0,
  );
});

test("actual parent refund preview is identical while the family schedule follows operational delivery", async () => {
  const { sql, me } = await fixture();
  const global = globalThis as typeof globalThis & { __pgSqlPromise__?: Promise<Sql> };
  const previous = global.__pgSqlPromise__;
  global.__pgSqlPromise__ = Promise.resolve(sql);
  try {
    const { squareRefundPreview } = await import("../commerce/square-management.server");
    const { readFamilyBilling } = await import("../commerce/portal.server");
    const before = await squareRefundPreview("parent", "lesson");
    assert.equal(before.refundCents, 10000);
    await saveOrganizationBookingOperation(
      sql,
      "owner",
      await operation(sql, "reschedule", { date: "2030-01-07", time: "17:00" }),
    );
    await saveOrganizationBookingOperation(sql, "owner", await operation(sql, "cancel"));
    assert.deepEqual(await squareRefundPreview("parent", "lesson"), before);
    const row = (await readFamilyBilling(sql, me)).bookings.find((b) => b.id === "lesson")!;
    assert.equal(row.status, "cancelled");
    assert.equal(row.financial_status, "confirmed");
    assert.equal(new Date(row.starts_at).toISOString(), "2030-01-07T23:00:00.000Z");
    assert.equal(row.financial_checked_in_at, null);
  } finally {
    global.__pgSqlPromise__ = previous;
  }
});
test("paid individual camp unenrollment survives group moves without changing original commitments", async () => {
  const { sql } = await fixture(),
    e = await camp(sql),
    o = await pending(sql, e);
  await pay(sql, o);
  const key = operationalEventSessionKey(e.id, e.sessions[0]),
    before = await finances(sql);
  await saveOperationalEventEnrollment(sql, "owner", {
    eventId: e.id,
    sessionKey: key,
    sessionRevision: 0,
    athleteId: "athlete",
    revision: 0,
    action: "unenroll",
    reason: "Player cannot attend this day",
  });
  await saveOrganizationEventSessionOperation(sql, "owner", {
    eventId: e.id,
    sessionKey: key,
    revision: 0,
    action: "reschedule",
    date: "2030-01-10",
    start: "16:00",
    end: "17:00",
    location: "Facility",
    reason: "Change group schedule",
  });
  assert.deepEqual(await finances(sql), before);
  assert.equal(
    (
      await sql`select * from operational_booking_schedule where order_id=${o.id} and status='cancelled'`
    ).length,
    1,
  );
  assert.equal(
    (await eventFamily(sql, "parent")).registrations[0].operationalSessions[0].status,
    "cancelled",
  );
  assert.equal(
    (
      await sql`select * from booking_occupancy where booking_id in(select id from booking_records where order_id=${o.id})`
    ).length,
    0,
  );
});
