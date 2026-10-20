import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { emptyDevelopment } from "../pd/empty";

test("owners can assign lessons while financially restricted operations cannot change compensation", async () => {
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
  const state = globalThis as typeof globalThis & { __pgSqlPromise__?: Promise<Sql> };
  const old = state.__pgSqlPromise__,
    oldUrl = process.env.DATABASE_URL,
    oldContext = process.env.CONTEXT;
  try {
    for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("migrations/" + f, "utf8"));
    const sql = wrap(db.query.bind(db));
    state.__pgSqlPromise__ = Promise.resolve(sql);
    process.env.DATABASE_URL = "postgresql://unused.invalid/disposable";
    process.env.CONTEXT = "dev";
    for (const role of ["admin", "coach", "parent", "player", "operations"]) {
      await sql`insert into "user"(id,email,name,"emailVerified","createdAt","updatedAt") values(${role},${role + "@example.invalid"},${role},true,now(),now())`;
      await sql`insert into profiles(user_id,email,name,role) values(${role},${role + "@example.invalid"},${role},${role === "operations" ? "parent" : role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('admin@example.invalid','admin')`;
    await sql`insert into organization_operational_access(user_id,status,updated_by) values('operations','active','admin')`;
    const file = emptyDevelopment();
    for (const id of ["available", "busy", "short", "wrong", "inactive"]) {
      file.coaches.push({
        id,
        name: id,
        email: id + "@example.invalid",
        active: true,
        specialties: ["Pitching"],
      });
      file.availability.push({
        id,
        coachId: id,
        weekday: "Mon",
        window: id === "short" ? "16:00–16:30" : "16:00–20:00",
      });
      await sql`insert into club_staff(id,name,email,role,active) values(${id},${id},${id + "@example.invalid"},'coach',${id !== "inactive"})`;
      await sql`insert into club_staff_services(staff_id,service_id,profit_split) values(${id},${id === "wrong" ? "s2" : "s3"},65)`;
    }
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},0)`;
    await sql`insert into club_households(id,primary_email) values('family','parent@example.invalid')`;
    await sql`insert into club_athletes(id,household_id,household_email,name) values('athlete','family','parent@example.invalid','Synthetic Player')`;
    await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,square_payment_id,household_id) values('paid','paid','parent','parent@example.invalid','s3','lesson','{"receipt":"keep original"}'::jsonb,10400,'paid','square','square-paid','family')`;
    await sql`insert into square_payments(id,order_id,environment,amount_cents,status) values('square-paid','paid','sandbox',10400,'COMPLETED')`;
    const start = "2030-01-07T22:00:00.000Z",
      end = "2030-01-07T23:00:00.000Z";
    await sql`insert into booking_records(id,order_id,user_id,athlete_id,product_id,starts_at,ends_at,resources,status,household_id) values('lesson','paid','parent','athlete','s3',${start},${end},'["lane:1","athlete:athlete"]'::jsonb,'confirmed','family')`;
    await sql`insert into booking_participants(booking_id,athlete_id) values('lesson','athlete')`;
    await sql`insert into booking_records(id,product_id,coach_id,starts_at,ends_at,resources,status) values('camp','camp','busy',${start},${end},'["coach:busy"]'::jsonb,'confirmed')`;
    for (let ms = +new Date(start); ms < +new Date(end); ms += 300000) {
      for (const resource of ["lane:1", "athlete:athlete"])
        await sql`insert into booking_occupancy values(${resource},${new Date(ms).toISOString()},'lesson')`;
      await sql`insert into booking_occupancy values('coach:busy',${new Date(ms).toISOString()},'camp')`;
    }
    const { lessonAssignmentList, lessonInstructorChoices, assignLessonInstructor } =
      await import("./lesson-assignment.server");
    const input = {
      id: "lesson",
      coachId: "available",
      expectedCoachId: null,
      startsAt: start,
      endsAt: end,
    };
    const before = (await sql`select * from booking_records where id='lesson'`)[0];
    const money = await sql`select * from commerce_orders`;
    const payments = await sql`select * from square_payments`;
    const participants = await sql`select * from booking_participants`;
    const catalog = await sql`select * from club_services order by id`;
    const splits = await sql`select * from club_staff_services order by staff_id,service_id`;
    const credits = await sql`select * from credit_grants order by id`;
    const workingFile = await sql`select * from pd_working_file`;
    const occupancy =
      await sql`select * from booking_occupancy where booking_id='lesson' order by resource_id,slot_at`;
    for (const role of ["parent", "coach", "player"]) {
      await assert.rejects(() => lessonAssignmentList(role), /access|Player/i);
      await assert.rejects(() => lessonInstructorChoices(role, "lesson"), /access|Player/i);
      await assert.rejects(() => assignLessonInstructor(role, input), /access|Player/i);
    }
    assert.equal((await lessonAssignmentList("admin"))[0].coachId, null);
    const operationalRows = await lessonAssignmentList("operations");
    assert.deepEqual(operationalRows, await lessonAssignmentList("admin"));
    assert.deepEqual(
      Object.keys(operationalRows[0]).sort(),
      [
        "id",
        "serviceName",
        "playerName",
        "customerEmail",
        "coachId",
        "coachName",
        "startsAt",
        "endsAt",
      ].sort(),
    );
    assert.doesNotMatch(
      JSON.stringify(operationalRows),
      /total_cents|receipt|snapshot|profit_split|10400|square-paid/,
    );
    assert.deepEqual(
      await lessonInstructorChoices("operations", "lesson"),
      await lessonInstructorChoices("admin", "lesson"),
    );
    for (const extra of [
      { total_cents: 1 },
      { profitSplit: 100 },
      { snapshot: { price: 1 } },
      { role: "admin" },
    ]) {
      await assert.rejects(() => assignLessonInstructor("operations", { ...input, ...extra }));
    }
    await assert.rejects(() =>
      assignLessonInstructor("operations", {
        ...input,
        coachId: { id: "available", price: 1 },
      } as unknown as typeof input),
    );
    assert.deepEqual((await sql`select * from booking_records where id='lesson'`)[0], before);
    // An initial instructor assignment also determines the future payee.
    await assert.rejects(() => assignLessonInstructor("operations", input), /owner.*compensation/i);
    assert.deepEqual((await sql`select * from booking_records where id='lesson'`)[0], before);
    assert.deepEqual(
      await sql`select * from booking_occupancy where booking_id='lesson' order by resource_id,slot_at`,
      occupancy,
    );
    assert.deepEqual((await lessonInstructorChoices("admin", "lesson")).instructors, [
      { id: "available", name: "available" },
    ]);
    for (const coachId of ["busy", "short", "wrong", "inactive"])
      await assert.rejects(
        () => assignLessonInstructor("admin", { ...input, coachId }),
        /unavailable/,
      );
    // A new booking between opening the picker and saving must be rejected.
    await sql`insert into booking_occupancy values('coach:available',${start},'camp')`;
    await assert.rejects(() => assignLessonInstructor("admin", input), /unavailable/);
    assert.deepEqual((await sql`select * from booking_records where id='lesson'`)[0], before);
    await sql`delete from booking_occupancy where booking_id='camp' and resource_id='coach:available'`;
    await assignLessonInstructor("admin", input);
    const after = (await sql`select * from booking_records where id='lesson'`)[0];
    assert.deepEqual({ ...after, coach_id: before.coach_id, resources: before.resources }, before);
    assert.equal(after.coach_id, "available");
    assert.deepEqual(after.resources, ["lane:1", "athlete:athlete", "coach:available"]);
    assert.deepEqual(await sql`select * from commerce_orders`, money);
    assert.deepEqual(await sql`select * from square_payments`, payments);
    assert.deepEqual(await sql`select * from booking_participants`, participants);
    assert.deepEqual(
      await sql`select * from booking_occupancy where booking_id='lesson' and resource_id not like 'coach:%' order by resource_id,slot_at`,
      occupancy,
    );
    assert.equal(
      (await sql`select * from booking_occupancy where resource_id='coach:available'`).length,
      12,
    );
    assert.ok(
      (
        await sql`select * from audit_events where target_id='lesson' and actor_id='admin' and action='UPDATE'`
      ).length,
    );
    await assert.rejects(() => assignLessonInstructor("admin", input), /changed/);
    await assert.rejects(
      () =>
        assignLessonInstructor("admin", {
          ...input,
          expectedCoachId: "available",
          startsAt: "2030-01-07T21:00:00.000Z",
        }),
      /changed/,
    );
    // When a coach becomes free, reassignment releases only the old coach slots.
    await sql`delete from booking_occupancy where booking_id='camp'`;
    const beforeDeniedReassignment = (
      await sql`select * from booking_records where id='lesson'`
    )[0];
    const occupancyBeforeDeniedReassignment =
      await sql`select * from booking_occupancy order by resource_id,slot_at`;
    await assert.rejects(
      () =>
        assignLessonInstructor("operations", {
          ...input,
          expectedCoachId: "available",
          coachId: "busy",
        }),
      /owner.*compensation/i,
    );
    assert.deepEqual(
      (await sql`select * from booking_records where id='lesson'`)[0],
      beforeDeniedReassignment,
    );
    assert.deepEqual(
      await sql`select * from booking_occupancy order by resource_id,slot_at`,
      occupancyBeforeDeniedReassignment,
    );
    assert.ok(
      (
        await sql`select id from coordinator_audit where actor_id='operations' and action='organization.lessons.assign' and result='denied'`
      ).length >= 2,
    );
    // A matching retry is genuinely idempotent: no booking or occupancy writes.
    await assignLessonInstructor("operations", {
      ...input,
      expectedCoachId: "available",
      coachId: "available",
    });
    assert.deepEqual(
      (await sql`select * from booking_records where id='lesson'`)[0],
      beforeDeniedReassignment,
    );
    assert.deepEqual(
      await sql`select * from booking_occupancy order by resource_id,slot_at`,
      occupancyBeforeDeniedReassignment,
    );
    assert.equal(
      (
        await sql`select id from audit_events where target_table='booking_records' and target_id='lesson' and actor_id='operations'`
      ).length,
      0,
    );
    await assignLessonInstructor("admin", {
      ...input,
      expectedCoachId: "available",
      coachId: "busy",
    });
    assert.equal(
      (await sql`select * from booking_occupancy where resource_id='coach:available'`).length,
      0,
    );
    assert.equal(
      (await sql`select * from booking_occupancy where resource_id='coach:busy'`).length,
      12,
    );
    assert.deepEqual(await sql`select * from commerce_orders`, money);
    assert.deepEqual(await sql`select * from square_payments`, payments);
    assert.deepEqual(await sql`select * from booking_participants`, participants);
    assert.deepEqual(await sql`select * from club_services order by id`, catalog);
    assert.deepEqual(
      await sql`select * from club_staff_services order by staff_id,service_id`,
      splits,
    );
    assert.deepEqual(await sql`select * from credit_grants order by id`, credits);
    assert.deepEqual(await sql`select * from pd_working_file`, workingFile);
    assert.equal(
      (await sql`select role from profiles where user_id='operations'`)[0].role,
      "parent",
    );
    assert.equal(
      (await sql`select user_id from owner_grants where user_id='operations'`).length,
      0,
    );
    assert.ok(
      (
        await sql`select id from coordinator_audit where actor_id='operations' and action='organization.lessons.assign' and result='allowed'`
      ).length,
    );
    for (const status of ["suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id='operations'`;
      await assert.rejects(() => lessonAssignmentList("operations"));
      await assert.rejects(() => lessonInstructorChoices("operations", "lesson"));
      await assert.rejects(() =>
        assignLessonInstructor("operations", { ...input, expectedCoachId: "busy" }),
      );
    }
    await sql`update booking_records set checked_in_at=now() where id='lesson'`;
    await assert.rejects(
      () => assignLessonInstructor("admin", { ...input, expectedCoachId: "busy" }),
      /upcoming confirmed/,
    );
    await sql`update booking_records set checked_in_at=null,status='cancelled' where id='lesson'`;
    await assert.rejects(
      () => assignLessonInstructor("admin", { ...input, expectedCoachId: "busy" }),
      /upcoming confirmed/,
    );
    assert.equal((await lessonAssignmentList("admin")).length, 0);
    // Test-only activation bypasses the separately reviewed owner command.
    await sql`update booking_records set status='confirmed' where id='lesson'`;
    await sql`update organization_operational_access set status='active' where user_id='operations'`;
    const { emptyClub } = await import("../teams/seed");
    await sql`insert into club_state(id,payload,rev) values('oklahoma-prospects',${JSON.stringify(emptyClub())}::jsonb,1)`;
    const { previewFinancialBasisInitialization, initializeFinancialBasisForOwner } =
      await import("../finance/basis.server");
    const preview = await previewFinancialBasisInitialization(sql, "admin");
    await initializeFinancialBasisForOwner(sql, "admin", {
      ...preview,
      reason: "Synthetic assignment preservation",
    });
    await assert.rejects(() => sql`update financial_basis_state set activation_state='active'`);
    const { applyFutureActiveSchemaForTest } = await import("../finance/context.test-fixture");
    await applyFutureActiveSchemaForTest(sql);
    const { financeWorkspace } = await import("../finance/store.server");
    const financialBefore = await financeWorkspace(sql, "admin");
    const basisBefore = await sql`select * from financial_basis_versions order by version`;
    await assignLessonInstructor("operations", {
      ...input,
      expectedCoachId: "busy",
      coachId: "available",
    });
    assert.equal(
      (await sql`select coach_id from booking_records where id='lesson'`)[0].coach_id,
      "available",
    );
    assert.deepEqual(await financeWorkspace(sql, "admin"), financialBefore);
    assert.deepEqual(
      await sql`select * from financial_basis_versions order by version`,
      basisBefore,
    );
    assert.deepEqual(await sql`select * from commerce_orders`, money);
    assert.deepEqual(await sql`select * from square_payments`, payments);
    assert.deepEqual(await sql`select * from credit_grants order by id`, credits);
    const { loadFinancialLessonInTransaction } = await import("../finance/context.server");
    const frozen = await sql.transaction((tx) => loadFinancialLessonInTransaction(tx, "lesson"));
    assert.equal(frozen.mode, "basis");
    if (frozen.mode === "basis") assert.equal(frozen.booking?.coach_id, "busy");
    await sql`update organization_operational_access set status='suspended' where user_id='operations'`;
    await assert.rejects(() =>
      assignLessonInstructor("operations", {
        ...input,
        expectedCoachId: "available",
        coachId: "busy",
      }),
    );
  } finally {
    state.__pgSqlPromise__ = old;
    if (oldUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldUrl;
    if (oldContext === undefined) delete process.env.CONTEXT;
    else process.env.CONTEXT = oldContext;
    await db.close();
  }
});
