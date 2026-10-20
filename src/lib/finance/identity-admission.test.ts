import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
} from "./basis.server";
import { applyFutureActiveSchemaForTest } from "./context.test-fixture";
import {
  previewFinancialIdentityAdmission,
  admitFinancialIdentity,
} from "./identity-admission.server";
import { myFinance, myPreference } from "./self.server";
import { withFinancialContext, loadFinancialLessonsInTransaction } from "./context.server";
import { assertFinancialInstructorRecognition } from "./identity-scope.server";
import { recognizeFinancialLessonInTransaction } from "./compensation.server";
import { lockFinancialExecution } from "./execution.server";
const db = new PGlite();
after(() => db.close());
function adapter(query: PGlite["query"], nested = false): Sql {
  const sql = (async (p: TemplateStringsArray, ...v: unknown[]) =>
    (
      await query(
        p.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        v,
      )
    ).rows) as Sql;
  sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
  sql.transaction = (fn) => {
    assert.equal(nested, false);
    return db.transaction((t) => fn(adapter(t.query.bind(t) as PGlite["query"], true)));
  };
  return sql;
}
async function fixture(implicitPayee = false) {
  await db.exec("drop schema public cascade; create schema public");
  for (const f of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + f, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, email, role] of [
    ["owner", "owner@example.invalid", "admin"],
    ["old", "instructor@example.invalid", "coach"],
    ["sara", "sara@example.invalid", "parent"],
    ["payroll-old", "payroll@example.invalid", "parent"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${email},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${email},${role})`;
  }
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  await sql`insert into club_staff(id,user_id,name,email,role,active) values('staff','old','Original Instructor','instructor@example.invalid','coach',true)`;
  await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','s2',60)`;
  await sql`insert into pd_working_file(id,payload) values('club',${JSON.stringify({ coaches: [{ id: "coach", name: "Original Instructor", email: "instructor@example.invalid", active: true }], coachPayouts: [] })})`;
  for (const [id, email] of [
    ["payee", "instructor@example.invalid"],
    ["payroll-payee", "payroll@example.invalid"],
  ].filter(([id]) => !implicitPayee || id !== "payee"))
    await sql`insert into finance_records(id,kind,payload) values(${id},'payee',${JSON.stringify({ id, email, name: id, role: "Instructor", method: "check", reference: "PRIVATE MASKED", active: true })}::jsonb)`;
  for (const id of ["old-lesson", "selected-lesson"]) {
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values(${id},${id},'family@example.invalid','s2','lesson','{}',10000,'paid','square','production')`;
    await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status) values(${id},${id},'production',10000,0,'COMPLETED')`;
    await sql`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values(${id},${id},'coach','s2','2026-01-01 12:00Z','2026-01-01 12:30Z','[]'::jsonb,'completed')`;
    await sql`insert into contractor_earnings(booking_id,coach_id,gross_cents,split_pct,amount_cents,status) values(${id},'coach',10000,60,6000,'payable')`;
  }
  const p = await previewFinancialBasisInitialization(sql, "owner");
  await initializeFinancialBasisForOwner(sql, "owner", {
    sourceClubRevision: p.sourceClubRevision,
    sourceDigest: p.sourceDigest,
    reason: "Synthetic identity admission fixture",
  });
  await applyFutureActiveSchemaForTest(sql);
  await sql`update "user" set email='original-now@example.invalid' where id='old'`;
  await sql`update "user" set email='payroll-original-now@example.invalid' where id='payroll-old'`;
  for (const [id, email] of [
    ["new", "instructor@example.invalid"],
    ["new-payroll", "payroll@example.invalid"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${email},true)`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${email},'coach')`;
    await sql`insert into person_profiles(user_id,instructor) values(${id},true)`;
  }
  return sql;
}
const instructor = {
  kind: "instructor",
  userId: "new",
  coachId: "coach",
  payeeId: "payee",
  bookingIds: [],
  orderIds: [],
};
async function admit(sql: Sql, selection: unknown = instructor) {
  const p = await previewFinancialIdentityAdmission(sql, "owner", selection);
  return admitFinancialIdentity(sql, "owner", {
    selection,
    expectedBasisVersion: p.basisVersion,
    reviewDigest: p.reviewDigest,
    confirmed: true,
    reason: "Explicit reviewed new self-finance identity",
  });
}
async function createLesson(sql: Sql, id: string) {
  await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values(${id},${id},'family@example.invalid','s2','lesson','{}',10000,'paid','square','production')`;
  await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status) values(${id},${id},'production',10000,0,'COMPLETED')`;
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await tx`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values(${id},${id},'coach','s2','2026-02-01 12:00Z','2026-02-01 12:30Z','[]'::jsonb,'completed')`;
  });
}
test("unadmitted reused email cannot inherit historical self finance, preference, or recognition", async () => {
  const sql = await fixture();
  assert.deepEqual((await myFinance(sql, "new")).rows, []);
  await assert.rejects(myPreference(sql, "new", { method: "check", reference: "not mine" }));
  await assert.rejects(
    sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      return recognizeFinancialLessonInTransaction(
        tx,
        "new",
        "old-lesson",
        "Unadmitted reused email",
      );
    }),
    /admission/,
  );
  assert.equal((await myFinance(sql, "old")).rows.length, 2);
});
test("explicit instructor admission grants only new bound versions and shared recognition/earnings scope", async () => {
  const sql = await fixture();
  await admit(sql);
  assert.deepEqual((await myFinance(sql, "new")).rows, []);
  await createLesson(sql, "new-lesson");
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await recognizeFinancialLessonInTransaction(
      tx,
      "new",
      "new-lesson",
      "Authorized completed original lesson",
    );
  });
  assert.deepEqual(
    (await myFinance(sql, "new")).rows.map((r) => r.id),
    ["lesson:new-lesson"],
  );
  await withFinancialContext(sql, "new", "read", async (tx, c) => {
    const ls = await loadFinancialLessonsInTransaction(tx, ["old-lesson"], c);
    assert.throws(
      () => assertFinancialInstructorRecognition(c, ls.get("old-lesson")!, "old-lesson"),
      /outside/,
    );
  });
  await assert.rejects(
    myPreference(sql, "new", { method: "check", reference: "private" }),
    /Front Office/,
  );
  const state = globalThis as typeof globalThis & { __pgSqlPromise__?: Promise<Sql> };
  const old = state.__pgSqlPromise__,
    url = process.env.DATABASE_URL;
  state.__pgSqlPromise__ = Promise.resolve(sql);
  process.env.DATABASE_URL = "postgresql://unused.invalid/disposable";
  try {
    const { earnings } = await import("../commerce/operations.server");
    assert.deepEqual(
      (await earnings("new")).rows.map((r) => r.booking_id),
      ["new-lesson"],
    );
    await assert.rejects(earnings("sara"));
  } finally {
    state.__pgSqlPromise__ = old;
    if (url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = url;
  }
});
test("explicit selected old lesson grants only that lesson, never the other old email obligations", async () => {
  const sql = await fixture();
  await admit(sql, { ...instructor, bookingIds: ["selected-lesson"] });
  assert.deepEqual(
    (await myFinance(sql, "new")).rows.map((r) => r.id),
    ["lesson:selected-lesson"],
  );
});
test("review digest invalidates target contact and selected order changes; basis and confirmation are mandatory", async () => {
  const sql = await fixture();
  const p = await previewFinancialIdentityAdmission(sql, "owner", instructor);
  const command = {
    selection: instructor,
    expectedBasisVersion: p.basisVersion,
    reviewDigest: p.reviewDigest,
    confirmed: true,
    reason: "Review all selected identity fields",
  };
  await assert.rejects(admitFinancialIdentity(sql, "owner", { ...command, confirmed: false }));
  await assert.rejects(
    admitFinancialIdentity(sql, "owner", { ...command, expectedBasisVersion: 99 }),
    /changed/,
  );
  await sql`update "user" set name='New reviewed name' where id='new'`;
  await assert.rejects(admitFinancialIdentity(sql, "owner", command), /review changed/i);
  assert.equal(
    (await sql<{ current_version: number }>`select current_version from financial_basis_state`)[0]
      .current_version,
    1,
  );
});
test("current genuine owner and verified unrestricted target checks are required on preview and write", async () => {
  const sql = await fixture();
  await assert.rejects(previewFinancialIdentityAdmission(sql, "sara", instructor));
  await assert.rejects(previewFinancialIdentityAdmission(sql, "new", instructor));
  await sql`update "user" set "emailVerified"=false where id='new'`;
  await assert.rejects(previewFinancialIdentityAdmission(sql, "owner", instructor));
  await sql`update "user" set "emailVerified"=true where id='new'`;
  const p = await previewFinancialIdentityAdmission(sql, "owner", instructor);
  await sql`update owner_grants set revoked_at=now() where user_id='owner'`;
  await assert.rejects(
    admitFinancialIdentity(sql, "owner", {
      selection: instructor,
      expectedBasisVersion: 1,
      reviewDigest: p.reviewDigest,
      confirmed: true,
      reason: "Revoked owner denied",
    }),
  );
});
test("admission audit failure rolls back identity and basis version together", async () => {
  const sql = await fixture();
  const before = await sql`select * from financial_basis_state`;
  await db.exec(
    "create function reject_admission_audit() returns trigger language plpgsql as $$ begin raise exception 'audit blocked'; end $$; create trigger reject_admission_audit before insert on finance_audit for each row execute function reject_admission_audit()",
  );
  await assert.rejects(admit(sql), /audit blocked/);
  assert.deepEqual(await sql`select * from financial_basis_state`, before);
  assert.equal((await sql`select version from financial_basis_versions`).length, 1);
});
test("payroll admission scopes exact account and starting month without generating a payable", async () => {
  const sql = await fixture();
  await admit(sql, {
    kind: "payroll",
    userId: "new-payroll",
    coachId: "",
    payeeId: "payroll-payee",
    fromMonth: "2026-10",
    bookingIds: [],
    orderIds: [],
  });
  assert.deepEqual((await myFinance(sql, "new-payroll")).rows, []);
  for (const [id, payeeId] of [
    ["staff:2026-09:new-payroll", "payroll-payee"],
    ["staff:2026-10:new-payroll", "payroll-payee"],
    ["staff:2026-10:payroll-old", "payroll-payee"],
    ["manual-old", "payroll-payee"],
  ])
    await sql`insert into finance_records(id,kind,payload) values(${id},'payable',${JSON.stringify({ id, payeeId, reason: id, category: "staff", teamId: "", amount: 100, earned: 100, approved: 0, paid: 0, due: "2026-10-31", state: "accrued" })}::jsonb)`;
  assert.deepEqual(
    (await myFinance(sql, "new-payroll")).rows.map((r) => r.id),
    ["staff:2026-10:new-payroll"],
  );
  await assert.rejects(myPreference(sql, "new-payroll", { method: "cash", reference: "none" }));
  await withFinancialContext(sql, "new-payroll", "read", async (tx, c) => {
    const l = (await loadFinancialLessonsInTransaction(tx, ["old-lesson"], c)).get("old-lesson")!;
    assert.throws(() => assertFinancialInstructorRecognition(c, l, "old-lesson"), /outside/);
  });
});

test("only explicitly reviewed pending pinned orders cross the new instructor access version", async () => {
  const sql = await fixture();
  const pin = {
    basisVersion: 1,
    coachId: "coach",
    productId: "s2",
    startsAt: "2026-03-01T12:00:00.000Z",
    endsAt: "2026-03-01T12:30:00.000Z",
  };
  for (const id of ["selected-order", "unselected-order"])
    await sql`insert into commerce_orders(id,request_key,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment) values(${id},${id},'family@example.invalid','s2','lesson',${JSON.stringify({ financialLessonAdmission: pin })}::jsonb,10000,'pending','square','production')`;
  const selection = { ...instructor, orderIds: ["selected-order"] };
  const p = await previewFinancialIdentityAdmission(sql, "owner", selection);
  await sql`update commerce_orders set status='payment_review' where id='selected-order'`;
  await assert.rejects(
    admitFinancialIdentity(sql, "owner", {
      selection,
      expectedBasisVersion: 1,
      reviewDigest: p.reviewDigest,
      confirmed: true,
      reason: "Changed order must be reviewed",
    }),
    /review changed/i,
  );
  await admit(sql, selection);
  for (const id of ["selected-order", "unselected-order"]) {
    await sql`update commerce_orders set status='paid' where id=${id}`;
    await sql`insert into square_payments(id,order_id,environment,amount_cents,refunded_cents,status) values(${id},${id},'production',10000,0,'COMPLETED')`;
    await sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      await tx`insert into booking_records(id,order_id,coach_id,product_id,starts_at,ends_at,resources,status) values(${id},${id},'coach','s2',${pin.startsAt},${pin.endsAt},'[]'::jsonb,'completed')`;
    });
  }
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await recognizeFinancialLessonInTransaction(
      tx,
      "new",
      "selected-order",
      "Selected original prepared lesson",
    );
  });
  await assert.rejects(
    sql.transaction(async (tx) => {
      await lockFinancialExecution(tx);
      await recognizeFinancialLessonInTransaction(
        tx,
        "new",
        "unselected-order",
        "Unselected original prepared lesson",
      );
    }),
    /outside/,
  );
  assert.deepEqual(
    (await myFinance(sql, "new")).rows.map((r) => r.id),
    ["lesson:selected-order"],
  );
  assert.equal(
    (
      await sql<{
        basis_version: number;
      }>`select basis_version from financial_lesson_bindings where booking_id='selected-order'`
    )[0].basis_version,
    1,
  );
});
test("current target disablement or sticky restriction after preview prevents admission and later financial reads", async () => {
  const sql = await fixture();
  const p = await previewFinancialIdentityAdmission(sql, "owner", instructor);
  const command = {
    selection: instructor,
    expectedBasisVersion: 1,
    reviewDigest: p.reviewDigest,
    confirmed: true,
    reason: "Current account security must remain valid",
  };
  await sql`update "user" set "disabledAt"=now() where id='new'`;
  await assert.rejects(admitFinancialIdentity(sql, "owner", command));
  await sql`update "user" set "disabledAt"=null where id='new'`;
  await admit(sql);
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('new','active','owner')`;
  await assert.rejects(myFinance(sql, "new"));
});

test("restored owner UI flat preview reviews candidates and admits only individually selected historical records", async () => {
  const sql = await fixture();
  const selection = { kind: "instructor", userId: "new", coachId: "coach" };
  const p = await previewFinancialIdentityAdmission(sql, "owner", selection);
  assert.equal(p.kind, "instructor");
  assert.equal(p.payee.id, "payee");
  assert.deepEqual(
    p.bookings.map((b) => b.id),
    ["old-lesson", "selected-lesson"],
  );
  await admitFinancialIdentity(sql, "owner", {
    ...selection,
    expectedBasisVersion: p.basisVersion,
    reviewDigest: p.reviewDigest,
    bookingIds: ["selected-lesson"],
    orderIds: [],
    confirmed: true,
    reason: "Owner explicitly reviewed selected original lesson",
  });
  assert.deepEqual(
    (await myFinance(sql, "new")).rows.map((r) => r.id),
    ["lesson:selected-lesson"],
  );
});
test("restored owner UI payroll contract keeps exact month scope and rejects hidden lesson enrollment", async () => {
  const sql = await fixture();
  const selection = { kind: "payroll", userId: "new-payroll", payrollFromMonth: "2026-10" };
  const p = await previewFinancialIdentityAdmission(sql, "owner", selection);
  assert.equal(p.payee.id, "payroll-payee");
  assert.deepEqual(p.bookings, []);
  await assert.rejects(
    admitFinancialIdentity(sql, "owner", {
      ...selection,
      expectedBasisVersion: p.basisVersion,
      reviewDigest: p.reviewDigest,
      bookingIds: ["old-lesson"],
      orderIds: [],
      confirmed: true,
      reason: "Hidden lesson is denied",
    }),
    /original records/,
  );
  await admitFinancialIdentity(sql, "owner", {
    ...selection,
    expectedBasisVersion: p.basisVersion,
    reviewDigest: p.reviewDigest,
    bookingIds: [],
    orderIds: [],
    confirmed: true,
    reason: "Owner reviewed payroll month and identity",
  });
  assert.deepEqual((await myFinance(sql, "new-payroll")).rows, []);
});

test("ordinary saved instructor without a custom payee retains its approved generated payee identity", async () => {
  const sql = await fixture(true);
  const selection = { kind: "instructor", userId: "new", coachId: "coach" };
  const p = await previewFinancialIdentityAdmission(sql, "owner", selection);
  assert.match(p.payee.id, /^person:/);
  await admitFinancialIdentity(sql, "owner", {
    ...selection,
    expectedBasisVersion: p.basisVersion,
    reviewDigest: p.reviewDigest,
    bookingIds: [],
    orderIds: [],
    confirmed: true,
    reason: "Owner reviews existing generated instructor attribution",
  });
  assert.deepEqual((await myFinance(sql, "new")).rows, []);
  await createLesson(sql, "implicit-new");
  await sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await recognizeFinancialLessonInTransaction(
      tx,
      "new",
      "implicit-new",
      "Completed approved original attribution",
    );
  });
  assert.deepEqual(
    (await myFinance(sql, "new")).rows.map((r) => r.id),
    ["lesson:implicit-new"],
  );
});
