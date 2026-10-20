import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import {
  adminTryoutEventsFor,
  operationalTryoutEnrollmentsFor,
  publicTryoutEventsFor,
  saveTryoutEventFor,
} from "./tryout-events.server";
import type { TryoutEventInput } from "./tryout-events-contracts";

async function fixture() {
  const db = new PGlite();
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile(`migrations/${name}`, "utf8"));
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
  const sql = wrap(db.query.bind(db));
  for (const id of ["steve", "sara", "parent", "coach", "fake-admin"]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${id === "steve" || id === "fake-admin" ? "admin" : id === "coach" ? "coach" : "parent"})`;
  }
  await sql`insert into owner_grants(email,user_id) values('steve@example.invalid','steve')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','steve')`;
  const event: TryoutEventInput = {
    id: randomUUID(),
    revision: 0,
    sport: "Baseball",
    season: "Spring 2030",
    ageGroups: ["10U"],
    date: "2030-04-05",
    startTime: "14:00",
    endTime: "15:00",
    location: "Synthetic Facility",
    capacity: 2,
    status: "draft",
  };
  return { db, sql, event };
}

test("organization tryout events preserve owner access, consent, event locks and financial isolation", async () => {
  const { db, sql, event } = await fixture();
  try {
    for (const id of ["parent", "coach", "fake-admin", "unknown"]) {
      await assert.rejects(() => adminTryoutEventsFor(sql, id));
      await assert.rejects(() => operationalTryoutEnrollmentsFor(sql, id));
      await assert.rejects(() => saveTryoutEventFor(sql, id, event));
    }
    await sql`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status) values('own-order','own-order','sara','sara@example.invalid','s3','lesson','{"financialSecret":"own-finance-sentinel"}'::jsonb,10400,'paid')`;
    const finances = await sql`select * from commerce_orders order by id`;
    const catalog = await sql`select * from club_services order by id`;
    const applicant = {
      player: "Synthetic Player",
      email: "family@example.invalid",
      sport: event.sport,
      age: "10U",
      season: event.season,
      autoEnroll: true,
      payment: { total: "finance-sentinel" },
      notes: "finance-sentinel",
    };
    for (const [id, input] of [
      ["consented", applicant],
      ["not-consented", { ...applicant, player: "No Consent", autoEnroll: false }],
      ["individual", { ...applicant, player: "Individual Preference", requestType: "individual" }],
    ] as const)
      await sql`insert into club_requests(id,kind,payload) values(${id},'tryout',${JSON.stringify(input)}::jsonb)`;
    await saveTryoutEventFor(sql, "steve", event);
    assert.deepEqual(
      await adminTryoutEventsFor(sql, "sara"),
      await adminTryoutEventsFor(sql, "steve"),
    );
    let current = (await adminTryoutEventsFor(sql, "sara"))[0];
    for (const extra of [
      { fee: 100 },
      { payment: { total: 100 } },
      { finance: { refund: true } },
      { updated_by: "steve" },
    ]) {
      await assert.rejects(() => saveTryoutEventFor(sql, "sara", { ...current, ...extra }));
    }
    for (const bad of [
      { ageGroups: [{ age: "10U", price: 1 }] },
      { location: { location: "Field", payment: 1 } },
    ]) {
      await assert.rejects(() =>
        saveTryoutEventFor(sql, "sara", { ...current, ...bad } as unknown as TryoutEventInput),
      );
    }
    await saveTryoutEventFor(sql, "sara", { ...current, status: "published" });
    assert.equal((await publicTryoutEventsFor(sql)).length, 1);
    const enrollments = await operationalTryoutEnrollmentsFor(sql, "sara");
    assert.equal(enrollments.length, 1);
    assert.equal(enrollments[0].player, "Synthetic Player");
    assert.equal(enrollments[0].notification, "pending");
    assert.deepEqual(
      Object.keys(enrollments[0]).sort(),
      ["id", "eventId", "player", "email", "status", "notification"].sort(),
    );
    assert.doesNotMatch(
      JSON.stringify(enrollments),
      /finance-sentinel|payment|total|notes|payload|order/,
    );
    assert.deepEqual(await operationalTryoutEnrollmentsFor(sql, "steve"), enrollments);
    assert.deepEqual(
      Object.keys((await adminTryoutEventsFor(sql, "sara"))[0]).sort(),
      Object.keys(event).sort(),
    );
    current = (await adminTryoutEventsFor(sql, "sara"))[0];
    await assert.rejects(
      () => saveTryoutEventFor(sql, "sara", { ...current, status: "draft" }),
      /Cancel/,
    );
    await assert.rejects(
      () => saveTryoutEventFor(sql, "sara", { ...current, sport: "Softball" }),
      /Cancel/,
    );
    await assert.rejects(
      () => saveTryoutEventFor(sql, "sara", { ...current, revision: 1 }),
      /Another editor/,
    );
    await sql`insert into club_staff(id,name,email,role,active) values('coach','Synthetic Coach','coach@example.invalid','coach',true)`;
    await sql`insert into booking_records(id,product_id,starts_at,ends_at,resources,status) values('reservation','tryout', '2030-04-05T19:00:00Z','2030-04-05T20:00:00Z','["lane:1"]'::jsonb,'confirmed')`;
    await sql`insert into tryout_event_reservations(event_id,booking_id,coach_id,lane_ids) values(${event.id},'reservation','coach',array['1'])`;
    const reservations = await sql`select * from booking_records where id='reservation'`;
    await assert.rejects(
      () => saveTryoutEventFor(sql, "sara", { ...current, status: "cancelled" }),
      /confirmed coach\/facility/,
    );
    assert.deepEqual(await sql`select * from booking_records where id='reservation'`, reservations);
    await sql`delete from tryout_event_reservations where event_id=${event.id}`;
    await saveTryoutEventFor(sql, "sara", { ...current, status: "cancelled" });
    assert.equal((await operationalTryoutEnrollmentsFor(sql, "sara"))[0].status, "cancelled");
    assert.deepEqual(await publicTryoutEventsFor(sql), []);
    // Legacy malformed mixed payloads cannot smuggle nested money through identity text.
    await sql`update club_requests set payload=payload||'{"player":{"payment":"nested-finance-sentinel"},"email":{"balance":42}}'::jsonb where id='consented'`;
    const malformed = (await operationalTryoutEnrollmentsFor(sql, "sara"))[0];
    assert.equal(malformed.player, "");
    assert.equal(malformed.email, "");
    assert.doesNotMatch(JSON.stringify(malformed), /nested-finance|balance|payment/);
    assert.deepEqual(await sql`select * from commerce_orders order by id`, finances);
    assert.deepEqual(await sql`select * from club_services order by id`, catalog);
    assert.equal((await sql`select role from profiles where user_id='sara'`)[0].role, "parent");
    assert.equal((await sql`select user_id from owner_grants where user_id='sara'`).length, 0);
    assert.ok(
      (
        await sql`select id from coordinator_audit where actor_id='sara' and action='organization.tryout-events.save' and result='allowed'`
      ).length,
    );
    assert.ok(
      (await sql`select id from coordinator_audit where actor_id='parent' and result='denied'`)
        .length,
    );
    assert.ok(
      (
        await sql`select id from audit_events where actor_id='sara' and target_table='tryout_events'`
      ).length,
    );
    for (const status of ["suspended", "removed"]) {
      await sql`update organization_operational_access set status=${status} where user_id='sara'`;
      await assert.rejects(() => adminTryoutEventsFor(sql, "sara"));
      await assert.rejects(() => operationalTryoutEnrollmentsFor(sql, "sara"));
      await assert.rejects(() => saveTryoutEventFor(sql, "sara", event));
    }
    await sql`update organization_operational_access set status='active' where user_id='sara'`;
    for (const state of ["unverified", "disabled"]) {
      await sql`update "user" set "emailVerified"=${state !== "unverified"},"disabledAt"=${state === "disabled" ? "2026-01-01" : null} where id='sara'`;
      await assert.rejects(() => adminTryoutEventsFor(sql, "sara"));
      await assert.rejects(() => operationalTryoutEnrollmentsFor(sql, "sara"));
      await assert.rejects(() => saveTryoutEventFor(sql, "sara", event));
    }
  } finally {
    await db.close();
  }
});

test("only reviewed operational event and assignment handlers opt in", async () => {
  for (const path of [
    "src/lib/tryout-events-api.ts",
    "src/lib/commerce/lesson-assignment-api.ts",
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /middleware\(\[operationalAuthMiddleware\]\)/);
    assert.doesNotMatch(source, /\.middleware\(\[authMiddleware\]\)/);
  }
  const api = await readFile("src/lib/tryout-events-api.ts", "utf8");
  assert.match(api, /operationalTryoutEnrollmentsFor/);
  assert.doesNotMatch(api, /import\("\.\/tryout-enrollment.server"\)/);
  const assignments = await readFile("src/lib/commerce/lesson-assignment.server.ts", "utf8");
  assert.doesNotMatch(assignments, /readWorkingFile|select b\.\*/);
  assert.match(assignments, /assignmentInput\.parse\(raw\)/);
});
