import test from "node:test";
import assert from "node:assert/strict";
import { auditHarness } from "./audit-support.mjs";

test("legacy lesson curriculum and preset functions require existing instructor authority", async (t) => {
  const h = await auditHarness(),
    { api, sql } = h;
  try {
    for (const [id, role] of [
      ["owner", "admin"],
      ["coach", "coach"],
      ["trainee", "parent"],
      ["other", "parent"],
      ["profile-instructor", "parent"],
      ["staff-instructor", "parent"],
    ]) {
      await sql`insert into "user"(id,name,email,"emailVerified") values(${id},${id},${id + "@audit.example.invalid"},true)`;
      await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@audit.example.invalid"},${role})`;
    }
    await sql`insert into owner_grants(email,user_id) values('owner@audit.example.invalid','owner')`;
    await sql`insert into person_profiles(user_id,instructor) values('profile-instructor',true)`;
    await sql`insert into club_services(id,kind,name,minutes,price,discipline) values('test-lesson','lesson','Synthetic Hitting',30,9876,'Hitting')`;
    await sql`insert into club_staff(id,user_id,name,email,role,active) values('staff','staff-instructor','Staff Instructor','staff-instructor@audit.example.invalid','coach',true)`;
    await sql`insert into club_staff_services(staff_id,service_id,profit_split) values('staff','test-lesson',60)`;
    const file = api.emptyDevelopment();
    file.coaches = ["coach", "trainee", "profile-instructor", "staff-instructor"].map((id) => ({
      id: id + "-coach",
      email: id + "@audit.example.invalid",
      name: id,
      active: true,
      specialties: [],
    }));
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},1)`;
    await sql`insert into club_state(id,payload,rev,demo) values('oklahoma-prospects',${JSON.stringify(api.emptyClub())}::jsonb,1,false)`;
    await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,profile) values('athlete','other','other@audit.example.invalid','Synthetic Athlete','2012-01-01','{"sport":"baseball"}'::jsonb)`;
    for (const [id, coach] of [
      ["private-draft", "trainee"],
      ["operational-draft", "trainee"],
      ["owner-review", "trainee"],
      ["coach-lesson", "coach"],
      ["profile-instructor-lesson", "profile-instructor"],
      ["staff-instructor-lesson", "staff-instructor"],
    ])
      await sql`insert into booking_records(id,user_id,athlete_id,coach_id,product_id,starts_at,ends_at,resources,status,lesson_sport) values(${id},'other','athlete',${coach + "-coach"},'test-lesson','2026-01-10T22:00:00Z','2026-01-10T22:30:00Z','[]'::jsonb,'confirmed','baseball')`;
    const preview = await api.financialBasis.previewFinancialBasisInitialization(sql, "owner");
    await api.financialBasis.initializeFinancialBasisForOwner(sql, "owner", {
      sourceClubRevision: preview.sourceClubRevision,
      sourceDigest: preview.sourceDigest,
      reason: "Synthetic legacy-route authorization fixture",
    });
    await api.financialContextFixture.applyFutureActiveSchemaForTest(sql);
    await sql`insert into operational_instruction_access(user_id,identity_email,coach_id,status,revision,updated_by) values('trainee','trainee@audit.example.invalid','trainee-coach','active',1,'owner')`;
    const privateLesson = await api.openLessonSession("owner", "private-draft");
    await sql`update guided_lesson_sessions set document=jsonb_set(document,'{coachNotes}','"PRIVATE-HISTORICAL-NARRATIVE"'::jsonb) where booking_id='private-draft'`;
    const ownLesson = await api.openLessonSession("trainee", "operational-draft");
    assert.equal(ownLesson.operationalOnly, true);

    function choice(opened, saveAs = "Synthetic saved choice") {
      const template = opened.session.snapshot.template;
      return {
        bookingId: opened.session.booking_id,
        revision: opened.session.revision,
        approach: "foundations",
        skill: "beginner",
        drillIds: api.lessonChoices(
          template.sport,
          template.discipline,
          template.minutes,
          template.adaptation.age,
          template.adaptation.level,
        )[0].recommendedDrillIds,
        objective: "Review a synthetic hitting objective",
        dose: "Controlled repetitions with rest",
        reason: "Qualified review for synthetic regression",
        qualifiedReview: true,
        timing: template.stages.map((stage) => stage.minutes),
        saveAs,
      };
    }
    await sql`insert into instructor_lesson_presets(id,author_id,name,sport,discipline,minutes,status,document) values('approved-private','owner','Private approved preset','baseball','Hitting',30,'approved',${JSON.stringify({ ...choice(privateLesson), reason: "PRIVATE-APPROVED-PRESET-DOCUMENT" })}::jsonb)`;

    async function snapshot() {
      const result = {};
      for (const table of [
        "user",
        "operational_instruction_access",
        "guided_lesson_sessions",
        "instructor_lesson_presets",
        "booking_records",
        "club_households",
        "household_members",
        "person_profiles",
        "profiles",
        "owner_grants",
        "pd_working_file",
        "financial_basis_state",
        "financial_basis_versions",
        "contractor_earnings",
        "athlete_assessments",
      ])
        result[table] = await sql.query(
          `select to_jsonb(t) as value from "${table}" t order by to_jsonb(t)::text`,
        );
      return result;
    }
    const denied =
      /Existing instructor authority|Instructor access required|Unauthorized|not authorized|verified|Verify/i;
    async function assertLegacyRoutesDenied() {
      const before = await snapshot();
      for (const opened of [privateLesson, ownLesson]) {
        await assert.rejects(api.chooseLessonForUser("trainee", choice(opened)), denied);
        await assert.rejects(
          api.lessonPresetsForUser("trainee", opened.session.booking_id),
          denied,
        );
      }
      await assert.rejects(
        api.reviewLegacyLesson("trainee", {
          bookingId: "owner-review",
          sport: "baseball",
          discipline: "Hitting",
          reason: "Synthetic review attempt must be denied",
        }),
        denied,
      );
      await assert.rejects(
        api.reviewLessonPresetForUser("trainee", {
          id: "approved-private",
          status: "retired",
          reason: "Synthetic preset review must be denied",
        }),
        denied,
      );
      assert.deepEqual(await snapshot(), before);
      assert.deepEqual(await sql`select * from household_members where user_id='trainee'`, []);
      assert.deepEqual(
        await sql`select * from club_households where primary_email='trainee@audit.example.invalid'`,
        [],
      );
    }
    await t.test(
      "active operational-only grant cannot read presets or change any draft",
      async () => {
        await assertLegacyRoutesDenied();
      },
    );
    await t.test(
      "absent, suspended, disabled, unverified and drifted accounts deny without provisioning",
      async () => {
        await sql`delete from operational_instruction_access where user_id='trainee'`;
        await assertLegacyRoutesDenied();
        await sql`insert into operational_instruction_access(user_id,identity_email,coach_id,status,revision,updated_by) values('trainee','trainee@audit.example.invalid','trainee-coach','active',1,'owner')`;
        await sql`update operational_instruction_access set status='suspended' where user_id='trainee'`;
        await assertLegacyRoutesDenied();
        await sql`update operational_instruction_access set status='active' where user_id='trainee'`;
        await sql`update "user" set "disabledAt"=now() where id='trainee'`;
        await assertLegacyRoutesDenied();
        await sql`update "user" set "disabledAt"=null,"emailVerified"=false where id='trainee'`;
        await assertLegacyRoutesDenied();
        await sql`update "user" set "emailVerified"=true,email='drifted@audit.example.invalid' where id='trainee'`;
        await assertLegacyRoutesDenied();
        assert.deepEqual(
          await sql`select * from club_households where primary_email='drifted@audit.example.invalid'`,
          [],
        );
        await sql`update "user" set email='trainee@audit.example.invalid' where id='trainee'`;
      },
    );
    await t.test(
      "genuine coach, person-instructor and commercial instructor retain curriculum and presets",
      async () => {
        await sql`insert into operational_instruction_access(user_id,identity_email,coach_id,status,revision,updated_by) values('coach','coach@audit.example.invalid','coach-coach','suspended',1,'owner')`;
        for (const userId of ["coach", "profile-instructor", "staff-instructor"]) {
          const opened = await api.openLessonSession(userId, userId + "-lesson");
          assert.equal(opened.operationalOnly, false);
          await api.chooseLessonForUser(userId, choice(opened, userId + " choice"));
          const presets = await api.lessonPresetsForUser(userId, userId + "-lesson");
          assert.ok(presets.some((p) => p.id === "approved-private"));
          assert.ok(presets.some((p) => p.name === userId + " choice"));
          await assert.rejects(
            api.reviewLessonPresetForUser(userId, {
              id: "approved-private",
              status: "retired",
              reason: "Only an owner may approve academy presets",
            }),
            /requires an admin/,
          );
        }
      },
    );
    await t.test(
      "genuine owner retains curriculum, preset approval and legacy resolution",
      async () => {
        await api.chooseLessonForUser("owner", choice(privateLesson, "Owner choice"));
        const presets = await api.lessonPresetsForUser("owner", "private-draft");
        assert.ok(presets.some((p) => p.id === "approved-private"));
        assert.ok(presets.some((p) => p.name === "Owner choice"));
        await api.reviewLessonPresetForUser("owner", {
          id: "approved-private",
          status: "retired",
          reason: "Owner-reviewed synthetic retirement",
        });
        await api.reviewLegacyLesson("owner", {
          bookingId: "owner-review",
          sport: "baseball",
          discipline: "Hitting",
          reason: "Owner verified the original synthetic booking",
        });
        const [saved] =
          await sql`select document,revision from guided_lesson_sessions where booking_id='private-draft'`;
        assert.equal(saved.document.coachNotes, "PRIVATE-HISTORICAL-NARRATIVE");
        assert.equal(saved.revision, privateLesson.session.revision + 1);
      },
    );
  } finally {
    await h.close();
  }
});
