import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture, preparePilot } from "./test-fixture";
import { enrollmentCase, enrollmentHome } from "./enrollment.server";
import {
  seasonProgress,
  saveProgress,
  reviewPilot,
  expandEnrollment,
  configureAdditionalTeam,
} from "./progress.server";
import { saveTeamStandards } from "./handbooks.server";
import { standards } from "./test-fixture";

test("attendance reuses the team calendar and attendance store; authorized operations cannot inspect private feedback or travel contacts", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    await preparePilot(sql);
    await sql`update coordinator_assignments set permissions=array['enrollment.read','enrollment.manage'] where user_id='coordinator'`;
    for (const teamId of ["base", "soft"]) {
      const key = { teamId, playerId: teamId + "-player" };
      await enrollmentCase(sql, "guardian", key);
      await sql`insert into club_athletes(id,household_email,name) values(${teamId + "-athlete"},'guardian@example.invalid','Synthetic Athlete')`;
      await sql`insert into team_dev_roster_links(id,team_id,roster_player_id,athlete_id) values(${teamId + "-link"},${teamId},${key.playerId},${teamId + "-athlete"})`;
      const id =
        teamId === "base"
          ? "11111111-1111-4111-8111-111111111111"
          : "22222222-2222-4222-8222-222222222222";
      await sql`insert into team_activities(id,team_id,payload,updated_by) values(${id},${teamId},${JSON.stringify({ title: "Synthetic practice", kind: "practice", date: "2026-01-01", startTime: "15:00", status: "scheduled", entryFee: 9137 })}::jsonb,'owner')`;
      const progress = await seasonProgress(sql, "guardian", key);
      assert.ok(progress.events.some((e) => e.id === id));
      assert.ok(!JSON.stringify(progress).includes("entryFee"));
      const notice = {
        ...key,
        action: "notice",
        activityKey: "activity:" + id,
        availability: "absent",
        noticeKind: "emergency",
        directContact: true,
        revision: 0,
      };
      await assert.rejects(saveProgress(sql, "player", notice), /guardian|available/);
      await saveProgress(sql, "guardian", notice);
      const staff = teamId === "base" ? "coach" : "coordinator";
      await saveProgress(sql, staff, {
        ...key,
        action: "acknowledge",
        activityKey: "activity:" + id,
        revision: 0,
      });
      await saveProgress(sql, staff, {
        ...key,
        action: "attendance",
        activityKey: "activity:" + id,
        status: "excused",
        expected: "",
      });
      assert.equal(
        (await seasonProgress(sql, "guardian", key)).events.find((e) => e.id === id)?.attendance,
        "excused",
      );
      assert.equal(
        (await seasonProgress(sql, "guardian", key)).events.find((e) => e.id === id)?.lateNotice,
        false,
      );
      await assert.rejects(
        saveProgress(sql, staff, {
          ...key,
          action: "attendance",
          activityKey: "activity:" + id,
          status: "absent",
          expected: "",
        }),
        /changed/,
      );
      const checkpoint = {
        ...key,
        action: "checkpoint",
        id: "",
        kind: "in-season",
        dueOn: "2026-01-01",
        completedOn: "2026-01-01",
        feedback: "Private observed development feedback with next steps.",
        assessmentId: "",
        revision: 0,
      };
      await assert.rejects(saveProgress(sql, "coordinator", checkpoint), /coach|available/);
      await assert.rejects(saveProgress(sql, "guardian", checkpoint), /coach/);
      await saveProgress(sql, "owner", checkpoint);
      await assert.rejects(
        saveProgress(sql, "owner", { ...checkpoint, assessmentId: "wrong-athlete" }),
        /Assessment/,
      );
      await saveProgress(sql, "guardian", {
        ...key,
        action: "travel",
        adultName: "Private Synthetic Adult",
        adultPhone: "555-010-1111",
        adultAtLeast18: true,
        guardianAuthorization: true,
        revision: 0,
      });
      await saveProgress(sql, "guardian", {
        ...key,
        action: "checklist",
        task: "uniform",
        complete: true,
        revision: 0,
      });
      await assert.rejects(
        saveProgress(sql, staff, {
          ...key,
          action: "checklist",
          task: "uniform",
          complete: true,
          revision: 0,
        }),
        /guardian/,
      );
      await saveProgress(sql, staff, {
        ...key,
        action: "checklist",
        task: "orientation",
        complete: true,
        revision: 0,
      });
    }
    const coord = await seasonProgress(sql, "coordinator", {
      teamId: "soft",
      playerId: "soft-player",
    });
    assert.equal(coord.checkpoints[0].feedback, "");
    assert.equal(coord.travel, null);
    assert.ok(!JSON.stringify(coord).includes("Private"));
    const stored = (await sql<{ payload: typeof club }>`select payload from club_state`)[0].payload;
    for (let n = 0; n < 2; n++) {
      const original = { ...club.teams[n], attendance: stored.teams[n].attendance };
      assert.deepEqual(stored.teams[n], original);
    }
    await sql`update coordinator_assignments set status='suspended' where user_id='coordinator'`;
    await assert.rejects(
      seasonProgress(sql, "coordinator", { teamId: "soft", playerId: "soft-player" }),
      /available/,
    );
  } finally {
    await db.close();
  }
});

test("organization expansion requires two observed pilots and owner evidence; additional teams retain individual signature gates", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    await preparePilot(sql);
    const expansion = {
      revision: 1,
      evidence: "Synthetic acceptance evidence for both isolated pilot teams.",
    };
    await assert.rejects(expandEnrollment(sql, "coach", expansion), /Owner/);
    await assert.rejects(expandEnrollment(sql, "owner", expansion), /Both/);
    await assert.rejects(
      configureAdditionalTeam(sql, "owner", {
        teamId: "base",
        seasonKey: "2027",
        revision: 0,
        signaturesOpen: true,
      }),
      /both/,
    );
    for (const teamId of ["base", "soft"]) {
      const key = { teamId, playerId: teamId + "-player" },
        c = await enrollmentCase(sql, "guardian", key);
      const review = {
        teamId,
        revision: 0,
        passed: true,
        evidence: "Synthetic feedback and role verification; never a real pilot.",
        permissionsVerified: true,
        familyAndCoachFeedback: true,
      };
      await assert.rejects(reviewPilot(sql, "owner", review), /30-day/);
      // Age and complete synthetic records only, to exercise the server rollout gate.
      await sql`update enrollment_cases set created_at=now()-interval '31 days',cleared_at=now(),cleared_by='owner' where id=${c.summary.id}`;
      for (const task of ["uniform", "schedule", "orientation", "goals", "day30"])
        await sql`insert into enrollment_checklist(case_id,task_key,completed,updated_by) values(${c.summary.id},${task},true,'owner')`;
      await sql`insert into enrollment_checkpoints(id,case_id,kind,due_on,completed_on,feedback,athlete_id,updated_by) values(${teamId + "-checkpoint"},${c.summary.id},'baseline','2026-01-01','2026-01-01','Synthetic feedback','synthetic','owner')`;
      await sql`insert into enrollment_absence_notices(case_id,activity_key,availability,notice_kind,direct_contact,submitted_by,acknowledged_by,acknowledged_at) values(${c.summary.id},'synthetic-event','going','planned',true,'guardian','owner',now())`;
      club.teams.find((t) => t.id === teamId)!.attendance = {
        "synthetic-event": { [key.playerId]: "present" },
      };
      await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
      await reviewPilot(sql, "owner", review);
    }
    await expandEnrollment(sql, "owner", expansion);
    assert.equal((await enrollmentHome(sql, "owner")).settings.mode, "organization");
    const extra = structuredClone(club.teams[0]);
    extra.id = "additional";
    extra.name = "Additional synthetic team";
    extra.roster[0].id = "additional-player";
    club.teams.push(extra);
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    await assert.rejects(
      configureAdditionalTeam(sql, "owner", {
        teamId: "additional",
        seasonKey: "2027",
        revision: 0,
        signaturesOpen: true,
      }),
      /Publish/,
    );
    await saveTeamStandards(sql, "owner", {
      teamId: "additional",
      version: 0,
      revision: 0,
      action: "publish",
      effectiveOn: "2026-01-01",
      standards,
    });
    await configureAdditionalTeam(sql, "owner", {
      teamId: "additional",
      seasonKey: "2027",
      revision: 0,
      signaturesOpen: true,
    });
    assert.equal(
      (
        await enrollmentCase(sql, "guardian", {
          teamId: "additional",
          playerId: "additional-player",
        })
      ).pilot.signaturesOpen,
      true,
    );
    await reviewPilot(sql, "owner", {
      teamId: "soft",
      revision: 1,
      passed: false,
      evidence: "Synthetic regression found; stop expansion until corrected.",
      permissionsVerified: true,
      familyAndCoachFeedback: true,
    });
    assert.equal((await enrollmentHome(sql, "owner")).settings.mode, "pilot");
    assert.equal(
      (
        await enrollmentCase(sql, "guardian", {
          teamId: "additional",
          playerId: "additional-player",
        })
      ).pilot.signaturesOpen,
      false,
    );
  } finally {
    await db.close();
  }
});
