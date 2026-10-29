import { approveSyntheticNotices } from "../notifications/release-control.test-fixture";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db";
import { sampleClub } from "../teams/seed";
import { emptyDevelopment } from "../pd/empty";
import { emptySharedProfile } from "../person-contracts";
import {
  organizationPeople,
  organizationPerson,
  saveOrganizationPerson,
} from "./organization-people.server";
import { organizationPersonInput } from "./organization-people-contracts";
import { publicPeopleFor } from "../person-public.server";
import { listStaffDirectoryFor, saveStaffListingFor } from "../staff-directory.server";
import { coachesWithAvailability, requireCoachService } from "../commerce/coach-services.server";
import { operationalCoachAvailability } from "../operational-person.server";
import {
  previewFinancialBasisInitialization,
  initializeFinancialBasisForOwner,
} from "../finance/basis.server";
import { applyFutureActiveSchemaForTest } from "../finance/context.test-fixture";
import { randomUUID } from "node:crypto";
import { deliverCenterNotifications } from "../tryout-center-delivery.server";
import { centerStaff, saveCenterWorkFor } from "../tryout-center.server";
const db = new PGlite();
after(() => db.close());
function adapter(query: PGlite["query"]): Sql {
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) =>
    (
      await query(
        parts.reduce((s, p, i) => s + (i ? "$" + i : "") + p, ""),
        values,
      )
    ).rows) as Sql;
  sql.query = (async (q: string, v: unknown[] = []) => (await query(q, v)).rows) as Sql["query"];
  sql.transaction = (work) =>
    db.transaction((tx) => work(adapter(tx.query.bind(tx) as PGlite["query"])));
  return sql;
}
async function fixture() {
  await db.exec("drop schema public cascade;create schema public");
  for (const name of (await readdir("migrations")).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile("migrations/" + name, "utf8"));
  const sql = adapter(db.query.bind(db));
  for (const [id, role] of [
    ["owner", "admin"],
    ["sara", "parent"],
    ["coach", "coach"],
    ["parent", "parent"],
    ["fake", "admin"],
  ]) {
    await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@example.invalid"},true)`;
    await sql`insert into profiles(user_id,name,email,role,family_id) values(${id},${id},${id + "@example.invalid"},${role},${id})`;
  }
  await sql`insert into owner_grants(user_id,email) values('owner','owner@example.invalid')`;
  await sql`insert into organization_operational_access(user_id,status,updated_by) values('sara','active','owner')`;
  const club = sampleClub();
  club._demo = false;
  club._rev = 1;
  club.teams = [];
  await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(club)}::jsonb,1,false)`;
  const file = emptyDevelopment();
  file.coaches = [
    {
      id: "coach-identity",
      name: "Coach",
      email: "coach@example.invalid",
      active: true,
      specialties: ["Pitching"],
    },
  ];
  file.availability = [
    { id: "original-window", coachId: "coach-identity", weekday: "Mon", window: "16:00–20:00" },
  ];
  await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)}::jsonb,1)`;
  await sql`insert into club_services(id,kind,name,discipline,minutes,price) values('lesson','lesson','Pitching','Pitching',30,10000)`;
  await sql`insert into club_staff(id,name,email,user_id,role,active) values('staff-coach','Coach','coach@example.invalid','coach','coach',true)`;
  await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff-coach','lesson',65)`;
  return { sql, file };
}
async function input(sql: Sql, id = "coach", actor = "owner") {
  const p = await organizationPerson(sql, actor, id);
  return organizationPersonInput.parse({
    userId: p.userId,
    revision: p.revision,
    profileRevision: p.profileRevision,
    sourceRevision: p.sourceRevision,
    contactEmail: p.contactEmail,
    phone: p.phone,
    active: p.active,
    profile: p.profile,
    publishCoach: p.publishCoach,
    publishInstructor: p.publishInstructor,
    windows: p.windows,
    unavailableServiceIds: p.services.filter((s) => !s.available).map((s) => s.id),
    reviewedPublication: false,
  });
}
async function protectedState(sql: Sql) {
  return Promise.all(
    [
      '"user"',
      "profiles",
      "owner_grants",
      "club_staff",
      "club_staff_services",
      "club_services",
      "club_state",
      "pd_working_file",
      "financial_basis_state",
      "financial_basis_versions",
    ].map((table) => sql.query(`select * from ${table} order by 1`)),
  );
}
test("operational contacts/status/windows preserve auth, pricing, identity and original paid eligibility", async () => {
  const { sql, file } = await fixture();
  const before = await protectedState(sql);
  const value = await input(sql);
  await saveOrganizationPerson(sql, "owner", {
    ...value,
    contactEmail: "contact@example.invalid",
    phone: "9185550101",
    windows: [{ weekday: "Tue", start: "16:00", end: "18:00" }],
    unavailableServiceIds: ["lesson"],
  });
  assert.deepEqual(await protectedState(sql), before);
  assert.equal((await sql`select * from person_profiles`).length, 0);
  assert.equal(
    (await organizationPerson(sql, "owner", "coach")).loginEmail,
    "coach@example.invalid",
  );
  assert.deepEqual(
    await coachesWithAvailability(sql, file.coaches, file.availability, [
      { id: "lesson", minutes: 30, discipline: "Pitching" },
    ]),
    [],
  );
  await requireCoachService(sql, file.coaches, "coach-identity", "lesson", { operational: false });
  await assert.rejects(saveOrganizationPerson(sql, "owner", value), /changed/);
  const updated = await input(sql);
  await saveOrganizationPerson(sql, "owner", { ...updated, active: false });
  assert.ok(!(await centerStaff(sql)).some((s) => s.id === "coach"));
  assert.ok((await centerStaff(sql, { includeInactive: true })).some((s) => s.id === "coach"));
  assert.deepEqual(await protectedState(sql), before);
});
test("source-bound availability survives unrelated PD updates but yields to actual owner schedule changes", async () => {
  const { sql, file } = await fixture();
  await saveOrganizationPerson(sql, "owner", {
    ...(await input(sql)),
    windows: [{ weekday: "Tue", start: "16:00", end: "18:00" }],
  });
  let effective = await operationalCoachAvailability(sql, file.coaches, file.availability);
  assert.equal(effective.availability[0].weekday, "Tue");
  await sql`update pd_working_file set revision=revision+1`;
  effective = await operationalCoachAvailability(sql, file.coaches, file.availability);
  assert.equal(effective.availability[0].weekday, "Tue");
  effective = await operationalCoachAvailability(sql, file.coaches, [
    { ...file.availability[0], window: "17:00–20:00" },
  ]);
  assert.equal(effective.availability[0].weekday, "Mon");
});
test("private mixed profile is unavailable to retired blanket actors and owner contact edits preserve it", async () => {
  const { sql } = await fixture();
  const privateProfile = {
    ...emptySharedProfile("Private salary name"),
    bio: "Private financial narrative",
    financialSecret: "hidden",
  };
  await sql`insert into person_profiles(user_id,profile,revision,instructor,publish_coach,publish_instructor) values('coach',${JSON.stringify(privateProfile)}::jsonb,1,true,false,false)`;
  await assert.rejects(organizationPerson(sql, "sara", "coach"));
  await assert.rejects(organizationPeople(sql, "sara"));
  const value = await input(sql);
  await assert.rejects(
    saveOrganizationPerson(sql, "sara", {
      ...value,
      publishCoach: true,
      reviewedPublication: true,
    }),
  );
  await saveOrganizationPerson(sql, "owner", { ...value, phone: "9185550101" });
  assert.deepEqual(
    (await sql<{ profile: unknown }>`select profile from person_profiles where user_id='coach'`)[0]
      .profile,
    privateProfile,
  );
});
test("public legacy profile representation survives contact-only changes and inactive privacy matches list/detail/public", async () => {
  const { sql } = await fixture();
  await sql`insert into coach_profiles(id,user_id,profile,published) values('legacy-coach','coach',${JSON.stringify({ name: "Public Coach", career: "Public bio", specialties: ["Pitching"], ages: "", approach: "", achievements: "", welcome: "" })}::jsonb,true)`;
  const before = await publicPeopleFor(sql);
  const value = await input(sql);
  assert.equal(value.publishCoach, true);
  assert.equal(value.publishInstructor, true);
  await saveOrganizationPerson(sql, "owner", { ...value, phone: "9185550101" });
  assert.deepEqual(await publicPeopleFor(sql), before);
  assert.equal((await sql`select * from person_profiles`).length, 0);
  await saveOrganizationPerson(sql, "owner", { ...(await input(sql)), active: false });
  assert.equal((await publicPeopleFor(sql)).length, 0);
  assert.equal((await organizationPerson(sql, "owner", "coach")).profile?.bio, "");
});
test("explicit reviewed operational public profile preserves base instructor and unknown fields; classification is revision-bound", async () => {
  const { sql } = await fixture();
  await sql`insert into person_profiles(user_id,profile,revision,instructor,publish_coach,publish_instructor) values('coach',${JSON.stringify({ ...emptySharedProfile("Coach"), bio: "Public", sports: ["baseball"], secret: "keep" })}::jsonb,1,true,true,true)`;
  const value = await input(sql);
  await assert.rejects(
    saveOrganizationPerson(sql, "owner", {
      ...value,
      profile: { ...value.profile!, bio: "New public" },
    }),
    /Review/,
  );
  await saveOrganizationPerson(sql, "owner", {
    ...value,
    profile: { ...value.profile!, bio: "New public" },
    reviewedPublication: true,
  });
  const [row] = await sql<{
    instructor: boolean;
    profile: { secret: string };
  }>`select instructor,profile from person_profiles where user_id='coach'`;
  assert.equal(row.instructor, true);
  assert.equal(row.profile.secret, "keep");
  await sql`update person_profiles set publish_coach=false,publish_instructor=false,revision=revision+1 where user_id='coach'`;
  assert.equal((await organizationPerson(sql, "owner", "coach")).profile?.bio, "New public");
  await assert.rejects(organizationPerson(sql, "sara", "coach"));
});
test("owner staff contact changes preserve identity and private biography; retired blanket actors are denied", async () => {
  const { sql } = await fixture();
  const id = "00000000-0000-4000-8000-000000000002";
  await sql`insert into staff_directory(id,name,title,program,email,bio,published) values(${id},'Coach','Coach','Baseball','coach@example.invalid','Private salary',false)`;
  await assert.rejects(listStaffDirectoryFor(sql, "sara"));
  const [row] = await listStaffDirectoryFor(sql, "owner");
  const { bioWithheld: _, ...safe } = row as typeof row & { bioWithheld?: boolean };
  await assert.rejects(saveStaffListingFor(sql, "sara", { ...safe, published: true }));
  await saveStaffListingFor(sql, "owner", { ...safe, email: "newcontact@example.invalid" });
  const [stored] = await sql<{
    identity_user_id: string;
    bio: string;
  }>`select identity_user_id,bio from staff_directory where id=${id}`;
  assert.equal(stored.identity_user_id, "coach");
  assert.equal(stored.bio, "Private salary");
});
test("server rejects fake/removed/unverified actors and strict financial/security payload additions", async () => {
  const { sql } = await fixture();
  const value = await input(sql);
  for (const actor of ["fake", "parent", "missing"])
    await assert.rejects(saveOrganizationPerson(sql, actor, value));
  await assert.rejects(
    saveOrganizationPerson(sql, "owner", { ...value, instructor: true } as typeof value),
  );
  await assert.rejects(
    saveOrganizationPerson(sql, "owner", { ...value, unavailableServiceIds: ["unknown"] }),
  );
  await sql`update organization_operational_access set status='suspended' where user_id='sara'`;
  await assert.rejects(organizationPerson(sql, "sara", "coach"));
});

for (const mode of ["captured", "basis"])
  test(`People preserves every captured financial and authentication field (${mode})`, async () => {
    const { sql } = await fixture();
    const p = await previewFinancialBasisInitialization(sql, "owner");
    await initializeFinancialBasisForOwner(sql, "owner", {
      sourceClubRevision: p.sourceClubRevision,
      sourceDigest: p.sourceDigest,
      reason: "Synthetic operational person test",
    });
    if (mode === "basis") await applyFutureActiveSchemaForTest(sql);
    const before = await protectedState(sql);
    await saveOrganizationPerson(sql, "owner", {
      ...(await input(sql)),
      phone: "9185550101",
      active: false,
    });
    assert.deepEqual(await protectedState(sql), before);
  });

test("inactive current assignee survives unrelated follow-up and queued delivery; new inactive assignment is rejected", async () => {
  const { sql } = await fixture();
  await sql`insert into club_requests(id,kind,payload,status) values('request','tryout','{"sport":"Baseball","player":"Synthetic"}'::jsonb,'new')`;
  const value = {
    id: "request",
    revision: 0,
    assignee: "coach",
    teamId: "",
    status: "contacted" as const,
    followUpDate: "",
    note: "",
    actionId: randomUUID(),
  };
  await saveCenterWorkFor(sql, "owner", value);
  await saveOrganizationPerson(sql, "owner", { ...(await input(sql)), active: false });
  await saveCenterWorkFor(sql, "owner", {
    ...value,
    revision: 1,
    note: "Updated follow-up",
    actionId: randomUUID(),
  });
  await sql`insert into club_requests(id,kind,payload,status) values('new-request','tryout','{"sport":"Baseball","player":"Synthetic"}'::jsonb,'new')`;
  await assert.rejects(
    saveCenterWorkFor(sql, "owner", { ...value, id: "new-request", actionId: randomUUID() }),
    /active approved/,
  );
  await approveSyntheticNotices(sql, "center", {
    SQUARE_DEPLOY_CONTEXT: "dev",
    CONTEXT: "dev",
    RESEND_FROM_EMAIL: "club@example.invalid",
  });
  let sends = 0;
  await deliverCenterNotifications(
    sql,
    {
      RESEND_API_KEY: "synthetic-local-only",
      RESEND_FROM_EMAIL: "club@example.invalid",
      TRYOUT_NOTIFICATIONS_ENABLED: "true",
      SQUARE_DEPLOY_CONTEXT: "dev",
      CONTEXT: "dev",
      TRYOUT_EMAIL_TEST_RECIPIENTS: "coach@example.invalid",
    },
    async () => {
      sends++;
      return new Response(JSON.stringify({ id: "synthetic-provider" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  assert.ok(sends > 0);
  assert.equal(
    (
      await sql`select id from tryout_center_notices where recipient_id='coach' and status='skipped'`
    ).length,
    0,
  );
});

async function inactiveShared(sql: Sql, classified = false, invalid = false) {
  await sql`insert into person_profiles(user_id,profile,revision,instructor,publish_coach,publish_instructor) values('coach',${JSON.stringify({ ...emptySharedProfile("HIDDEN-PUBLIC-NAME"), bio: "HIDDEN-PUBLIC-BIO", sports: ["baseball"], photo: invalid ? "invalid-private-photo" : "" })}::jsonb,1,true,true,true)`;
  await sql`insert into operational_person_settings(user_id,revision,coach_id,directory_active,classified_profile_revision,updated_by) values('coach',1,'coach-identity',false,${classified ? 1 : null},'owner')`;
}
test("classification, publication and account status cannot restore retired blanket access", async () => {
  const { sql } = await fixture();
  await inactiveShared(sql);
  const value = await input(sql);
  for (const status of ["active", "suspended", "removed"]) {
    await sql`update organization_operational_access set status=${status} where user_id='sara'`;
    for (const classified of [false, true]) {
      await sql`update operational_person_settings set classified_profile_revision=${classified ? 1 : null} where user_id='coach'`;
      await assert.rejects(organizationPerson(sql, "sara", "coach"));
      await assert.rejects(organizationPeople(sql, "sara"));
      await assert.rejects(saveOrganizationPerson(sql, "sara", { ...value, active: true }));
      assert.equal((await publicPeopleFor(sql)).length, 0);
    }
  }
  await saveOrganizationPerson(sql, "owner", { ...(await input(sql)), active: true });
  assert.ok((await publicPeopleFor(sql)).some((p) => p.bio === "HIDDEN-PUBLIC-BIO"));
});
test("invalid public shared profile stays private regardless of classification", async () => {
  const { sql } = await fixture();
  await inactiveShared(sql, false, true);
  await sql`update operational_person_settings set directory_active=true where user_id='coach'`;
  for (const revision of [null, 1, 2]) {
    await sql`update operational_person_settings set classified_profile_revision=${revision} where user_id='coach'`;
    assert.equal((await publicPeopleFor(sql)).length, 0);
    await assert.rejects(organizationPerson(sql, "sara", "coach"));
    await assert.rejects(organizationPeople(sql, "sara"));
  }
});

test("legacy and directory publication cannot bypass retired access, including disabled targets", async () => {
  const { sql } = await fixture();
  await sql`insert into operational_person_settings(user_id,revision,coach_id,directory_active,updated_by) values('coach',1,'coach-identity',false,'owner')`;
  await sql`insert into coach_profiles(id,user_id,profile,published) values('legacy','coach','{"name":"Legacy","career":"HIDDEN-LEGACY-BIO"}'::jsonb,true)`;
  await assert.rejects(
    saveOrganizationPerson(sql, "sara", { ...(await input(sql)), active: true }),
  );
  assert.equal((await publicPeopleFor(sql)).length, 0);
  await sql`delete from coach_profiles`;
  await sql`insert into staff_directory(id,name,title,program,email,bio,published,operational_bio_version) values('00000000-0000-4000-8000-000000000004','Coach','Coach','Baseball','coach@example.invalid','HIDDEN-STAFF-BIO',true,1)`;
  for (const disabled of [false, true]) {
    if (disabled) {
      await sql`update operational_person_settings set directory_active=true where user_id='coach'`;
      await sql`update "user" set "disabledAt"=now() where id='coach'`;
    }
    await assert.rejects(listStaffDirectoryFor(sql, "sara"));
    const [row] = await listStaffDirectoryFor(sql, "owner");
    const { bioWithheld: _, ...safe } = row as typeof row & { bioWithheld?: boolean };
    await assert.rejects(saveStaffListingFor(sql, "sara", { ...safe, phone: "9185550101" }));
    await assert.rejects(
      saveOrganizationPerson(sql, "sara", { ...(await input(sql)), active: true }),
    );
    await saveStaffListingFor(sql, "owner", { ...safe, phone: "9185550101" });
    assert.equal((await listStaffDirectoryFor(sql, "owner"))[0].bio, "HIDDEN-STAFF-BIO");
    assert.equal((await publicPeopleFor(sql)).length, 0);
  }
});
