import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db";
import { emptyDevelopment } from "./pd/empty";
import { sampleClub } from "./teams/seed";
import { newCoachId } from "./coach-id.server";
import { resolveIdentity } from "./identity.server";
import {
  initializeFinancialBasisForOwner,
  previewFinancialBasisInitialization,
} from "./finance/basis.server";
import { applyFutureActiveSchemaForTest } from "./finance/context.test-fixture";
import { myFinance } from "./finance/self.server";
import { financialPrincipalInTransaction } from "./finance/principal.server";
import { lockFinancialExecution } from "./finance/execution.server";
import {
  saveOrganizationInstruction,
  operationalInstructionFor,
  operationalInstructionBookings,
  hasOperationalInstruction,
  operationalInstructionEntry,
} from "./operational-instruction.server";
import { operationalInstructionInput } from "./operational-instruction-contracts";
import { openLessonSessionFor, saveLessonSessionFor } from "./pd/lesson-session.server";
import { recordInstructorAttendance } from "./pd/operational-lesson.server";
import { instructorLessons } from "./recruiting.server";
const db = new PGlite();
after(() => db.close());
function adapter(query: PGlite["query"], nested = false): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
  sql.transaction = (work) => {
    assert.equal(nested, false);
    return db.transaction((tx) => work(adapter(tx.query.bind(tx) as PGlite["query"], true)));
  };
  return sql;
}
async function fixture(mode = "basis") {
  await db.exec("drop schema public cascade;create schema public");
  for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + file, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["sara", "parent"],
    ["trainee", "parent"],
    ["other", "parent"],
    ["player", "player"],
    ["coach", "coach"],
    ["fake-admin", "admin"],
    ["unverified", "parent"],
    ["disabled", "parent"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},${id !== "unverified"})`;
    await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@example.invalid"},${role})`;
  }
  await sql`update "user" set "disabledAt"=now() where id='disabled'`;
  await sql`insert into owner_grants(email,user_id) values('owner@example.invalid','owner')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const file = emptyDevelopment();
  file.coaches = [
    {
      id: "legacy-coach",
      email: "coach@example.invalid",
      name: "Coach",
      active: true,
      specialties: [],
    },
  ];
  await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},1)`;
  await sql`insert into club_services(id,kind,name,minutes,price,discipline) values('instruction-lesson','lesson','Instruction Lesson',30,9876,'Hitting')`;
  await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,profile) values('athlete','other','other@example.invalid','Synthetic Athlete','2012-01-01','{"sport":"baseball","privateFinance":"FINANCE-PRIVATE-999"}'::jsonb)`;
  const coachId = newCoachId("trainee@example.invalid");
  for (const [id, coach] of [
    ["assigned", coachId],
    ["attendance", coachId],
    ["legacy-private", coachId],
    ["other-booking", "legacy-coach"],
  ]) {
    await sql`insert into booking_records(id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status,lesson_sport) values(${id},'other','athlete',${coach},'instruction-lesson','2026-01-10T22:00:00Z','2026-01-10T22:30:00Z','[]'::jsonb,'confirmed','baseball')`;
  }
  await sql`insert into athlete_assessments(id,athlete_id,discipline,coach_user_id,completed_at,notes) values('private-assessment','athlete','Hitting','owner',now(),'FINANCE-PRIVATE-999')`;
  await resolveIdentity(sql, "trainee");
  await resolveIdentity(sql, "owner");
  if (mode !== "legacy") {
    const preview = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      sourceClubRevision: preview.sourceClubRevision,
      sourceDigest: preview.sourceDigest,
      reason: "Synthetic instructor isolation fixture",
    });
    if (mode === "basis") await applyFutureActiveSchemaForTest(sql);
  }
  return { sql, coachId };
}
const grant = (userId = "trainee", revision = 0, active = true) => ({
  userId,
  revision,
  active,
  reason: "Assign synthetic instructional workflow",
});
async function protectedRows(sql: Sql) {
  const result: Record<string, unknown> = {};
  for (const table of [
    "user",
    "profiles",
    "owner_grants",
    "session",
    "account",
    "club_staff",
    "club_staff_services",
    "club_services",
    "club_state",
    "pd_working_file",
    "person_profiles",
    "person_guardian_links",
    "person_player_links",
    "club_households",
    "household_members",
    "financial_basis_state",
    "financial_basis_versions",
    "financial_lesson_bindings",
    "commerce_orders",
    "booking_records",
    "contractor_earnings",
    "athlete_assessments",
    "finance_records",
    "team_fee_plans",
    "team_budget_master",
    "organization_operational_access",
  ])
    result[table] = await sql.query(
      `select to_jsonb(t) as value from "${table}" t order by to_jsonb(t)::text`,
    );
  return result;
}
for (const mode of ["legacy", "captured"])
  test(`instructor onboarding requires active basis (${mode})`, async () => {
    const { sql } = await fixture(mode);
    const before = await protectedRows(sql);
    await assert.rejects(
      saveOrganizationInstruction(sql, "owner", grant()),
      /cutover must be active/,
    );
    assert.deepEqual(await protectedRows(sql), before);
    assert.deepEqual(await sql`select * from operational_instruction_access`, []);
  });
test("revisioned operational instructor grants preserve finances and ordinary account authority", async () => {
  const { sql, coachId } = await fixture();
  const before = await protectedRows(sql);
  const identity = await resolveIdentity(sql, "trainee");
  const selfPay = await myFinance(sql, "trainee");
  await assert.rejects(saveOrganizationInstruction(sql, "other", grant()));
  await assert.rejects(saveOrganizationInstruction(sql, "sara", grant()));
  for (const target of [
    "sara",
    "owner",
    "player",
    "fake-admin",
    "unverified",
    "disabled",
    "missing",
  ])
    await assert.rejects(saveOrganizationInstruction(sql, "owner", grant(target)));
  assert.equal(operationalInstructionInput.safeParse({ ...grant(), role: "coach" }).success, false);
  await saveOrganizationInstruction(sql, "owner", grant());
  assert.deepEqual(await protectedRows(sql), before);
  assert.deepEqual(await resolveIdentity(sql, "trainee"), identity);
  assert.deepEqual(await myFinance(sql, "trainee"), selfPay);
  assert.equal((await resolveIdentity(sql, "owner")).role, "admin");
  assert.equal(await hasOperationalInstruction(sql, "trainee"), true);
  assert.equal(await hasOperationalInstruction(sql, "other"), false);
  assert.deepEqual(
    await sql.transaction((tx) => operationalInstructionFor(tx, "trainee", "lesson-draft")),
    { userId: "trainee", coachId },
  );
  assert.deepEqual(await instructorLessons(sql, await resolveIdentity(sql, "trainee")), []);
  assert.equal(
    (
      await sql.transaction(async (tx) => {
        await lockFinancialExecution(tx);
        return financialPrincipalInTransaction(tx, "trainee");
      })
    ).role,
    "parent",
  );
  await assert.rejects(saveOrganizationInstruction(sql, "owner", grant()), /changed/);
  await saveOrganizationInstruction(sql, "owner", grant("trainee", 1, false));
  assert.equal(await hasOperationalInstruction(sql, "trainee"), false);
  assert.deepEqual(await protectedRows(sql), before);
  await assert.rejects(operationalInstructionBookings(sql, "trainee"), /active operational/);
});
test("assigned operational lessons expose no prices/history and cannot publish financial completion", async () => {
  const { sql } = await fixture();
  await saveOrganizationInstruction(sql, "owner", grant());
  const before = await protectedRows(sql);
  const schedule = await operationalInstructionBookings(sql, "trainee");
  assert.deepEqual(schedule.map((r) => r.id).sort(), ["assigned", "attendance", "legacy-private"]);
  assert.doesNotMatch(JSON.stringify(schedule), /9876|FINANCE-PRIVATE|price|total_cents/);
  await assert.rejects(
    openLessonSessionFor(sql, "trainee", "other-booking"),
    /assigned instructor/,
  );
  const opened = await openLessonSessionFor(sql, "trainee", "assigned");
  assert.equal(opened.operationalOnly, true);
  assert.ok(opened.session);
  assert.doesNotMatch(
    JSON.stringify(opened),
    /9876|FINANCE-PRIVATE|profit_split|price|household_email|birth_date/,
  );
  assert.deepEqual(opened.session.snapshot.context.assessments, []);
  assert.equal(opened.session.operational_author_id, "trainee");
  const input = {
    bookingId: "assigned",
    revision: opened.session.revision,
    document: { ...opened.session.document, coachNotes: "Synthetic coaching observation" },
    complete: false,
  };
  await saveLessonSessionFor(sql, "trainee", input);
  await assert.rejects(saveLessonSessionFor(sql, "trainee", input), /Another editor/);
  await assert.rejects(
    saveLessonSessionFor(sql, "trainee", { ...input, revision: 2, complete: true }),
    /cannot publish/,
  );
  assert.deepEqual(await protectedRows(sql), before);
  await sql`update guided_lesson_sessions set updated_by='owner' where booking_id='assigned'`;
  await assert.rejects(openLessonSessionFor(sql, "trainee", "assigned"), /unreviewed history/);
  const owner = await openLessonSessionFor(sql, "owner", "legacy-private");
  assert.equal(owner.operationalOnly, false);
  await assert.rejects(
    openLessonSessionFor(sql, "trainee", "legacy-private"),
    /unreviewed history/,
  );
  await saveOrganizationInstruction(sql, "owner", grant("trainee", 1, false));
  await assert.rejects(openLessonSessionFor(sql, "trainee", "attendance"), /Instructor access/);
});
test("assigned attendance is idempotent, scoped and does not complete paid bookings or assessments", async () => {
  const { sql } = await fixture();
  await saveOrganizationInstruction(sql, "owner", grant());
  const before = await protectedRows(sql);
  const input = {
    bookingId: "attendance",
    expectedEndsAt: "2026-01-10T22:30:00.000Z",
    attendance: "present" as const,
    recap: "Synthetic attendance observed",
    qualifiedReview: true as const,
  };
  await assert.rejects(recordInstructorAttendance(sql, "other", input), /active operational/);
  await assert.rejects(
    recordInstructorAttendance(sql, "trainee", { ...input, bookingId: "other-booking" }),
    /ended, confirmed/,
  );
  await assert.rejects(
    recordInstructorAttendance(sql, "trainee", {
      ...input,
      expectedEndsAt: "2026-01-10T23:00:00.000Z",
    }),
    /changed/,
  );
  assert.equal((await recordInstructorAttendance(sql, "trainee", input)).recorded, true);
  assert.equal((await recordInstructorAttendance(sql, "trainee", input)).recorded, false);
  await openLessonSessionFor(sql, "trainee", "assigned");
  await assert.rejects(
    recordInstructorAttendance(sql, "trainee", { ...input, bookingId: "assigned" }),
    /unpublished guided evidence/,
  );
  assert.deepEqual(await protectedRows(sql), before);
  await sql`update "user" set "disabledAt"=now() where id='trainee'`;
  await assert.rejects(operationalInstructionBookings(sql, "trainee"));
  await saveOrganizationInstruction(sql, "owner", grant("trainee", 1, false));
  const [suspended] = await sql<{
    status: string;
  }>`select status from operational_instruction_access where user_id='trainee'`;
  assert.equal(suspended.status, "suspended");
});
test("operational identity fails closed after coach ID reuse or ambiguous assignment", async () => {
  const { sql, coachId } = await fixture();
  await saveOrganizationInstruction(sql, "owner", grant());
  const file = emptyDevelopment();
  file.coaches = [
    {
      id: coachId,
      email: "other@example.invalid",
      name: "Other Coach",
      specialties: [],
      active: true,
    },
  ];
  await sql`update pd_working_file set payload=${JSON.stringify(file)} where id='club'`;
  assert.equal(await hasOperationalInstruction(sql, "trainee"), false);
  await assert.rejects(operationalInstructionBookings(sql, "trainee"), /active operational/);
  file.coaches.push({
    id: coachId,
    email: "trainee@example.invalid",
    name: "Trainee",
    specialties: [],
    active: true,
  });
  await sql`update pd_working_file set payload=${JSON.stringify(file)} where id='club'`;
  assert.equal(await hasOperationalInstruction(sql, "trainee"), false);
  await assert.rejects(saveOrganizationInstruction(sql, "owner", grant("trainee", 1)), /identity/);
});
test("genuine legacy instructor authority persists when the operational overlay is suspended", async () => {
  const { sql } = await fixture();
  await saveOrganizationInstruction(sql, "owner", grant("coach"));
  await saveOrganizationInstruction(sql, "owner", grant("coach", 1, false));
  assert.equal(await hasOperationalInstruction(sql, "coach"), false);
  assert.equal((await resolveIdentity(sql, "coach")).role, "coach");
  const lesson = await openLessonSessionFor(sql, "coach", "other-booking");
  assert.equal(lesson.operationalOnly, false);
  assert.ok(lesson.session);
  const saved = await saveLessonSessionFor(sql, "coach", {
    bookingId: "other-booking",
    revision: lesson.session.revision,
    document: lesson.session.document,
    complete: false,
  });
  assert.equal(saved.revision, lesson.session.revision + 1);
});
test("current actor authority and email binding are rechecked while scheduling availability preserves existing lessons", async () => {
  const { sql, coachId } = await fixture();
  await saveOrganizationInstruction(sql, "owner", grant());
  await sql`insert into operational_person_settings(user_id,revision,coach_id,directory_active,updated_by) values('trainee',1,${coachId},false,'owner')`;
  assert.equal(await hasOperationalInstruction(sql, "trainee"), true);
  assert.equal((await operationalInstructionBookings(sql, "trainee")).length, 3);
  await sql`update operational_person_settings set directory_active=true where user_id='trainee'`;
  assert.equal(await hasOperationalInstruction(sql, "trainee"), true);
  await sql`update "user" set email='changed@example.invalid' where id='trainee'`;
  assert.equal(await hasOperationalInstruction(sql, "trainee"), false);
  await sql`update organization_operational_access set status='suspended' where user_id='sara'`;
  await assert.rejects(saveOrganizationInstruction(sql, "sara", grant("trainee", 1, false)));
  await saveOrganizationInstruction(sql, "owner", grant("trainee", 1, false));
  const [saved] = await sql<{
    status: string;
  }>`select status from operational_instruction_access where user_id='trainee'`;
  assert.equal(saved.status, "suspended");
});
test("opening operational instructor entry and drafts never provisions household bindings", async () => {
  const { sql } = await fixture();
  await sql`delete from household_members where user_id='trainee'`;
  await sql`delete from club_households where primary_email='trainee@example.invalid'`;
  await saveOrganizationInstruction(sql, "owner", grant());
  const before = await protectedRows(sql);
  assert.equal((await operationalInstructionEntry(sql, "trainee")).operationalOnly, true);
  const opened = await openLessonSessionFor(sql, "trainee", "assigned");
  assert.ok(opened.session);
  await saveLessonSessionFor(sql, "trainee", {
    bookingId: "assigned",
    revision: opened.session.revision,
    document: opened.session.document,
    complete: false,
  });
  assert.deepEqual(await protectedRows(sql), before);
});
