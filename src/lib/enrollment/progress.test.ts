import test from "node:test";
import assert from "node:assert/strict";
import { enrollmentFixture, preparePilot, prepareOrganization } from "./test-fixture";
import { enrollmentCase, enrollmentHome } from "./enrollment.server";
import {
  seasonProgress,
  saveProgress,
  expandEnrollment,
  configureAdditionalTeam,
} from "./progress.server";

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

test("owner-directed rollout includes current and future teams without pilots and preserves per-team pauses and season identity", async () => {
  const { db, sql, club } = await enrollmentFixture();
  try {
    await prepareOrganization(sql);
    let home = await enrollmentHome(sql, "owner");
    assert.equal(home.settings.mode, "organization");
    assert.equal(home.settings.activationBasis, "owner-directed");
    assert.equal(home.settings.allTeamsEnabled, true);
    assert.equal((await sql`select * from enrollment_pilots`).length, 0);
    assert.equal((await sql`select * from enrollment_cases`).length, 0);
    assert.equal(home.candidates.length, 2);
    const extra = structuredClone(club.teams[0]);
    extra.id = "additional";
    extra.name = "Additional synthetic team";
    extra.roster[0].id = "additional-player";
    const closed = structuredClone(extra);
    closed.id = "closed";
    closed.closed = true;
    club.teams.push(extra, closed);
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    const key = { teamId: "additional", playerId: "additional-player" };
    const c = await enrollmentCase(sql, "guardian", key);
    assert.equal(c.packet.ready, true);
    assert.equal(c.pilot.signaturesOpen, true);
    assert.ok(c.packet.documents.some((d) => d.documentId === "organization-standards"));
    assert.ok(
      c.packet.documents.every((d) => !d.review.legalReviewer && !d.review.insuranceReviewer),
    );
    assert.ok(!(await enrollmentHome(sql, "owner")).teams.some((t) => t.id === "closed"));
    const season = c.summary.seasonKey;
    extra.seasonLabel = "Changed calendar label";
    await sql`update club_state set payload=${JSON.stringify(club)}::jsonb`;
    assert.equal((await enrollmentCase(sql, "guardian", key)).summary.seasonKey, season);
    await assert.rejects(
      configureAdditionalTeam(sql, "coordinator", {
        teamId: "additional",
        seasonKey: season,
        signaturesOpen: false,
        revision: 0,
      }),
      /Owner/,
    );
    await configureAdditionalTeam(sql, "owner", {
      teamId: "additional",
      seasonKey: season,
      signaturesOpen: false,
      revision: 0,
    });
    assert.equal((await enrollmentCase(sql, "guardian", key)).pilot.signaturesOpen, false);
    await assert.rejects(
      expandEnrollment(sql, "coach", {
        revision: home.settings.revision,
        enabled: false,
        evidence: "Unauthorized synthetic global enrollment pause attempt.",
      }),
      /Owner/,
    );
    await expandEnrollment(sql, "owner", {
      revision: home.settings.revision,
      enabled: false,
      evidence: "Synthetic owner temporarily pauses organization signatures.",
    });
    assert.ok(
      (await enrollmentHome(sql, "guardian")).additionalTeams.every((t) => !t.signaturesOpen),
    );
    // Opening a case during the global pause must not create a permanent team pause.
    const pausedCase = await enrollmentCase(sql, "guardian", {
      teamId: "soft",
      playerId: "soft-player",
    });
    assert.equal(pausedCase.pilot.signaturesOpen, false);
    home = await enrollmentHome(sql, "owner");
    await expandEnrollment(sql, "owner", {
      revision: home.settings.revision,
      enabled: true,
      evidence: "Synthetic owner resumes organization signatures without pilots.",
    });
    assert.equal((await enrollmentCase(sql, "guardian", key)).pilot.signaturesOpen, false);
    assert.equal(
      (await enrollmentCase(sql, "guardian", { teamId: "base", playerId: "base-player" })).pilot
        .signaturesOpen,
      true,
    );
    assert.equal(
      (await enrollmentCase(sql, "guardian", { teamId: "soft", playerId: "soft-player" })).pilot
        .signaturesOpen,
      true,
    );
    assert.equal((await sql`select * from enrollment_pilots`).length, 0);
  } finally {
    await db.close();
  }
});
