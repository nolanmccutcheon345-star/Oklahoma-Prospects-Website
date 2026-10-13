import test from "node:test";
import assert from "node:assert/strict";
import { auditHarness } from "./audit-support.mjs";
test("connected home training: authority, snapshots, idempotency, evidence and safety", async (t) => {
  const h = await auditHarness(),
    { sql, api } = h;
  try {
    for (const [id, role] of [
      ["coach", "coach"],
      ["other", "coach"],
      ["parent", "parent"],
      ["stranger", "parent"],
      ["admin", "admin"],
    ]) {
      await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${id},${id},${id + "@audit.example.invalid"},true,now(),now())`;
      await sql`insert into profiles(user_id,name,email,role) values(${id},${id},${id + "@audit.example.invalid"},${role})`;
    }
    await sql`insert into owner_grants(user_id,email) values('admin','admin@audit.example.invalid')`;
    await sql`insert into club_households(id,primary_email) values('home','parent@audit.example.invalid')`;
    for (const id of ["child", "sibling"])
      await sql`insert into club_athletes(id,user_id,household_id,household_email,name,birth_date,profile,coach_ids) values(${id},'parent','home','parent@audit.example.invalid',${id},'2014-01-01','{"sport":"baseball","sports":["baseball","softball"]}'::jsonb,'["coach-id"]'::jsonb)`;
    await sql`insert into club_athletes(id,user_id,household_email,name,birth_date,profile) values('unrelated-child','stranger','stranger@audit.example.invalid','Unrelated','2013-01-01','{"sport":"baseball"}'::jsonb)`;
    const file = api.emptyDevelopment();
    file.coaches = [
      {
        id: "coach-id",
        name: "Coach",
        email: "coach@audit.example.invalid",
        active: true,
        specialties: ["Hitting"],
      },
      {
        id: "other-id",
        name: "Other",
        email: "other@audit.example.invalid",
        active: true,
        specialties: [],
      },
    ];
    await sql`insert into pd_working_file(id,payload,revision) values('club',${JSON.stringify(file)},0)`;
    const today = api.chicagoDate(new Date()),
      drill = api.trainingDrills.find((d) => d.discipline === "Hitting" && d.minimumSkill === 0);
    const input = {
      id: "assignment-1",
      athleteId: "child",
      sport: "baseball",
      discipline: "Hitting",
      title: "Control before speed",
      skill: "beginner",
      weeks: 2,
      startDate: today,
      reviewDate: today,
      goal: "Eight balanced contacts in ten observed attempts",
      baseline: "Five balanced contacts from ten easy tee swings",
      workload:
        "Coach checked team practices and existing plans; one easy home session, no extra throwing.",
      equipment: "Adult, fitted bat, tee, clear net lane",
      reason: "Observed loss of balance; start with comfortable tee work.",
      qualifiedReview: true,
      tasks: [
        {
          id: "task-1",
          drillId: drill.id,
          date: today,
          dose: "Coach-selected short comfortable set, no maximum effort",
          rest: "Full recovery and stop if technique changes",
          target: "Balanced contact and comfortable finish",
        },
      ],
    };
    await t.test("unauthorized roles cannot assign or read another household", async () => {
      for (const user of ["parent", "stranger", "other"])
        await assert.rejects(api.assignTrainingForUser(user, input));
      await assert.rejects(api.loadTrainingForUser("parent", "unrelated-child"));
      await assert.rejects(api.loadTrainingForUser("stranger", "child"));
    });
    await t.test("missing review and incompatible sport/skill are rejected", async () => {
      await assert.rejects(
        api.assignTrainingForUser("coach", { ...input, qualifiedReview: false }),
      );
      const sb = api.trainingDrills.find((d) => d.id.startsWith("training-softballpitching"));
      await assert.rejects(
        api.assignTrainingForUser("coach", {
          ...input,
          tasks: [{ ...input.tasks[0], drillId: sb.id }],
        }),
        /incompatible/,
      );
      await assert.rejects(
        api.assignTrainingForUser("coach", { ...input, tasks: [input.tasks[0], input.tasks[0]] }),
        /Duplicate/,
      );
    });
    await t.test(
      "publish stores a versioned instruction snapshot; retries do not duplicate",
      async () => {
        const a = await api.assignTrainingForUser("coach", input);
        assert.equal(a.document.drills[0].name, drill.name);
        assert.equal(a.status, "active");
        assert.equal((await api.assignTrainingForUser("coach", input)).id, a.id);
        await assert.rejects(
          api.assignTrainingForUser("coach", { ...input, goal: "Different retry content" }),
          /different content/,
        );
        assert.equal((await sql`select * from training_assignments`).length, 1);
        const d = await api.loadTrainingForUser("parent", "child");
        assert.equal(d.coach, false);
        assert.equal(d.assignments[0].document.goal, input.goal);
        assert.equal((await api.loadTrainingForUser("parent", "sibling")).assignments.length, 0);
      },
    );
    const log = {
      assignmentId: input.id,
      taskId: "task-1",
      revision: 0,
      status: "partial",
      notes: "Six attempts; balance improved",
      question: "Can we repeat this at the next lesson?",
      repetitions: 6,
      successful: 4,
      sets: 1,
      load: 0,
      minutes: 5,
      throws: 0,
      throwType: "",
      distance: "",
      intensity: "easy",
      rpe: 3,
      fatigue: "none",
      pain: false,
    };
    await t.test(
      "family report persists across independent reads and preserves provenance",
      async () => {
        const first = await api.logTrainingForUser("parent", log);
        assert.equal(first.document.source, "self-reported");
        assert.equal((await api.logTrainingForUser("parent", log)).revision, 1);
        const d = await api.loadTrainingForUser("coach", "child");
        assert.equal(d.logs[0].document.question, log.question);
        assert.equal((await api.loadTrainingForUser("parent", "child")).logs.length, 1);
        await assert.rejects(api.logTrainingForUser("stranger", log));
        await assert.rejects(
          api.logTrainingForUser("parent", { ...log, notes: "stale edit" }),
          /Reload/,
        );
        await assert.rejects(
          api.logTrainingForUser("parent", { ...log, taskId: "other-player-task" }),
          /not assigned/,
        );
      },
    );
    await t.test(
      "self-report cannot establish mastery; coach feedback is durable and visible",
      async () => {
        await assert.rejects(
          api.reviewTrainingForUser("coach", {
            assignmentId: input.id,
            revision: 1,
            action: "advance",
            feedback: "Advance based only on home report",
            safetyReviewed: false,
          }),
          /coach-observed/,
        );
        await api.reviewTrainingForUser("coach", {
          assignmentId: input.id,
          revision: 1,
          action: "repeat",
          feedback: "Repeat the same comfortable task. We will compare balance next lesson.",
          safetyReviewed: false,
        });
        const d = await api.loadTrainingForUser("parent", "child");
        assert.ok(d.events.some((e) => e.document.feedback?.includes("Repeat the same")));
        await assert.rejects(
          api.reviewTrainingForUser("parent", {
            assignmentId: input.id,
            revision: 2,
            action: "complete",
            feedback: "Parent attempts completion",
            safetyReviewed: false,
          }),
        );
      },
    );
    await t.test(
      "pain pauses concurrent programs and blocks additional assignments and unreviewed resume",
      async () => {
        await api.assignTrainingForUser("coach", {
          ...input,
          id: "assignment-2",
          reviewedAssignmentIds: [input.id],
          sport: "softball",
        });
        await api.logTrainingForUser("parent", {
          ...log,
          revision: 1,
          pain: true,
          notes: "Stopped immediately because of pain",
        });
        const d = await api.loadTrainingForUser("coach", "child");
        assert.ok(d.assignments.every((a) => a.status === "paused"));
        assert.equal(d.events.filter((e) => e.kind === "safety hold").length, 2);
        await assert.rejects(
          api.assignTrainingForUser("coach", { ...input, id: "assignment-3" }),
          /hold/,
        );
        const a = d.assignments.find((a) => a.id === input.id);
        await assert.rejects(
          api.reviewTrainingForUser("coach", {
            assignmentId: a.id,
            revision: a.revision,
            action: "continue",
            feedback: "Attempting resume without review",
            safetyReviewed: false,
          }),
          /clearance/,
        );
        await api.reviewTrainingForUser("coach", {
          assignmentId: a.id,
          revision: a.revision,
          action: "continue",
          feedback:
            "Synthetic test: reviewed guardian concern and appropriate professional guidance before resuming.",
          safetyReviewed: true,
        });
      },
    );
    await t.test(
      "coach observations cannot be overwritten by a parent; no recruiting or financial writes",
      async () => {
        await api.logTrainingForUser("coach", {
          ...log,
          revision: 2,
          status: "full",
          notes: "Coach observed balanced control after appropriate review",
        });
        await assert.rejects(
          api.logTrainingForUser("parent", {
            ...log,
            revision: 3,
            notes: "Attempt to replace coach observation",
          }),
          /cannot be overwritten/,
        );
        const a = (await api.loadTrainingForUser("coach", "child")).assignments.find(
          (a) => a.id === input.id,
        );
        await api.reviewTrainingForUser("coach", {
          assignmentId: a.id,
          revision: a.revision,
          action: "advance",
          feedback: "Coach observed consistent control in comparable conditions.",
          safetyReviewed: false,
        });
        assert.equal((await sql`select * from contractor_earnings`).length, 0);
        assert.equal((await sql`select * from commerce_orders`).length, 0);
        assert.equal(
          (await sql`select * from home_training_events where kind='practice'`).length,
          3,
        );
        await assert.rejects(sql`delete from home_training_events`, /append-only/);
      },
    );
    await t.test(
      "drill governance requires academy review and preserves assigned versions after retirement",
      async () => {
        const {
          id: _id,
          version: _version,
          review: _review,
          contentUpdatedAt: _updated,
          lastQualifiedReviewAt: _reviewed,
          relatedIds: _related,
          ...fields
        } = drill;
        const versionId = "9b6b0a12-6598-43a7-a055-95fe3a4cf970";
        const submission = { ...fields, id: versionId, name: "Synthetic reviewed contact drill" };
        await assert.rejects(api.submitDrillForUser("parent", submission), /Instructor/);
        await api.submitDrillForUser("coach", submission);
        const customId = "custom:" + versionId;
        assert.equal((await api.contentForUser("parent")).submissions.length, 0);
        assert.ok(!(await api.contentForUser("parent")).drills.some((d) => d.id === customId));
        assert.equal((await api.contentForUser("other")).submissions.length, 0);
        const assigned = {
          ...input,
          id: "custom-plan",
          athleteId: "sibling",
          tasks: [{ ...input.tasks[0], drillId: customId }],
        };
        await assert.rejects(api.assignTrainingForUser("coach", assigned), /incompatible/);
        await assert.rejects(
          api.reviewDrillForUser("coach", {
            id: versionId,
            status: "approved",
            reason: "Synthetic qualified review",
          }),
          /admin/,
        );
        await api.reviewDrillForUser("admin", {
          id: versionId,
          status: "approved",
          reason: "Synthetic admin review of qualified authorship, technique and constraints.",
        });
        await api.assignTrainingForUser("coach", assigned);
        await api.reviewDrillForUser("admin", {
          id: versionId,
          status: "retired",
          reason: "Synthetic retirement for future selections.",
        });
        assert.ok(!(await api.contentForUser("parent")).drills.some((d) => d.id === customId));
        await assert.rejects(
          api.assignTrainingForUser("coach", {
            ...assigned,
            id: "retired-plan",
            reviewedAssignmentIds: [assigned.id],
          }),
          /incompatible/,
        );
        assert.equal(
          (await api.loadTrainingForUser("parent", "sibling")).assignments[0].document.drills[0]
            .name,
          submission.name,
        );
        await api.submitDrillForUser("coach", {
          ...submission,
          id: "9b6b0a12-6598-43a7-a055-95fe3a4cf971",
          parentId: versionId,
          name: "Synthetic revised contact drill",
        });
        assert.equal((await api.contentForUser("coach")).submissions.length, 2);
      },
    );
    await t.test("ninety lesson approaches preserve stage order, duration and discipline", () => {
      let count = 0;
      for (const sport of ["baseball", "softball"])
        for (const discipline of api.lessonDisciplines)
          for (const minutes of [30, 60, 75]) {
            const choices = api.lessonChoices(sport, discipline, minutes, 12, 1);
            assert.equal(choices.length, 3);
            for (const choice of choices) {
              count++;
              assert.equal(
                choice.stages.reduce((s, x) => s + x.minutes, 0),
                minutes,
              );
              assert.equal(choice.discipline, discipline);
              assert.equal(choice.stages[3].name, "Sport-Specific Warm-up");
              assert.equal(choice.stages[4].name, "Drills");
            }
          }
      assert.equal(count, 90);
      const base = api.resolveTemplate("baseball", "Hitting", 30, 12, 1);
      const c = {
        bookingId: "b",
        revision: 1,
        approach: "foundations",
        skill: "beginner",
        drillIds: [drill.id],
        objective: "Balanced contact",
        dose: "Individual reviewed short set",
        reason: "Recorded balance issue",
        qualifiedReview: true,
        timing: base.stages.map((s) => s.minutes),
      };
      assert.equal(api.customizeLesson(base, c).drills[0].id, drill.id);
      assert.throws(
        () => api.customizeLesson(base, { ...c, timing: [1, 1, 1, 1, 1, 1, 1, 1] }),
        /duration/,
      );
      assert.throws(
        () => api.customizeLesson(base, { ...c, approach: "game performance" }),
        /foundational/,
      );
    });
    await t.test(
      "specialty phases, changing workload, private evidence and academy review",
      async () => {
        await sql`insert into club_athletes(id,user_id,household_id,household_email,name,birth_date,profile,coach_ids) values('young','parent','home','parent@audit.example.invalid','Young Softball','2019-01-01','{"sport":"softball"}'::jsonb,'["coach-id","other-id"]'::jsonb)`;
        const program = api.developmentPrograms.find((p) => p.id === "softball-pitch-foundation");
        const plan = {
          ...input,
          id: "phase-plan",
          athleteId: "young",
          sport: "softball",
          discipline: "Pitching",
          programId: program.id,
          tasks: program.phases.map((p, phase) => ({
            ...input.tasks[0],
            id: "phase-" + phase,
            phase,
            drillId: p.drillIds[0],
          })),
        };
        const a = await api.assignTrainingForUser("coach", plan);
        assert.equal(a.document.program.id, program.id);
        await assert.rejects(
          api.assignTrainingForUser("other", { ...plan, id: "unreviewed-conflict" }),
          /workload changed/,
        );
        await assert.rejects(
          api.logTrainingForUser("parent", { ...log, assignmentId: a.id, taskId: "phase-1" }),
          /phase needs/,
        );
        await api.logTrainingForUser("parent", { ...log, assignmentId: a.id, taskId: "phase-0" });
        await assert.rejects(
          api.reviewTrainingForUser("other", {
            assignmentId: a.id,
            revision: 1,
            action: "advance",
            feedback: "Self report is not enough for advancement",
            safetyReviewed: false,
          }),
          /coach-observed/,
        );
        await api.logTrainingForUser("other", {
          ...log,
          assignmentId: a.id,
          taskId: "phase-0",
          revision: 1,
          status: "full",
          notes: "Coach observed comfortable dry circle and balance",
        });
        await api.reviewTrainingForUser("other", {
          assignmentId: a.id,
          revision: 1,
          action: "advance",
          feedback: "Observed first checkpoint and approved next phase",
          safetyReviewed: false,
        });
        await assert.rejects(
          api.reviewTrainingForUser("other", {
            assignmentId: a.id,
            revision: 2,
            action: "advance",
            feedback: "Cannot reuse the earlier phase observation",
            safetyReviewed: false,
          }),
          /coach-observed/,
        );
        const family = await api.loadTrainingForUser("parent", "young");
        assert.equal(family.context, null);
        assert.equal(family.workload, null);
        assert.equal(family.assignments[0].document.evidence, undefined);
        assert.equal(family.assignments[0].document.program.id, program.id);
        await assert.rejects(api.trainingQualityForUser("parent", "young"));
        await assert.rejects(api.trainingQualityForUser("coach", "young"), /administrator/);
        const q = {
          assignmentId: a.id,
          requestId: "a8c2dd4d-cff6-47d9-897a-f9e0c805a381",
          feedback: "Constructive academy feedback: document the current checkpoint clearly.",
          checks: ["evidence supports progression"],
        };
        await api.reviewTrainingQualityForUser("admin", q);
        await api.reviewTrainingQualityForUser("admin", q);
        assert.equal((await api.trainingQualityForUser("admin", "young")).reviews.length, 1);
        assert.ok(
          !(await api.loadTrainingForUser("parent", "young")).events.some(
            (e) => e.kind === "quality review",
          ),
        );
        await api.logTrainingForUser("parent", {
          ...log,
          assignmentId: a.id,
          taskId: "phase-1",
          pain: true,
          notes: "Stopped and notified adult",
        });
        assert.ok((await api.trainingInboxForUser("parent")).some((n) => n.athleteId === "young"));
        assert.ok((await api.trainingInboxForUser("other")).some((n) => n.athleteId === "young"));
        assert.equal((await api.trainingInboxForUser("stranger")).length, 0);
        assert.ok(
          (await api.loadTrainingForUser("parent", "child")).assignments.every(
            (x) => x.athlete_id === "child",
          ),
        );
      },
    );
  } finally {
    await h.close();
  }
});
