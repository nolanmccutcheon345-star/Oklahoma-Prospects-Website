import { developmentPrograms, compatibleProgram } from "./development-programs";
import { developmentEvidence, developmentWorkload } from "./development-evidence";
import { approvedDrills } from "./training-content.server";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { readWorkingFile } from "./desk-impl.server";
import { scopeForViewer, assertAthleteAccess, canCoachAthlete } from "./access";
import { ageOnClubDay } from "./engines";
import { chicagoDate } from "../scheduling";
import { ageBand, skillBands, programFamilies, TRAINING_VERSION } from "./training-catalog";
import {
  assignmentInput,
  practiceInput,
  trainingReviewInput,
  type TrainingAssignment,
  type TrainingLog,
  type AssignmentInput,
  type PracticeInput,
  type TrainingReviewInput,
} from "./training";
async function authority(
  sql: Sql,
  userId: string,
  athleteId: string,
  writeCoach = false,
  identity?: Awaited<ReturnType<typeof resolveIdentity>>,
) {
  const me = identity || (await resolveIdentity(sql, userId)),
    file = await readWorkingFile(sql),
    scope = scopeForViewer(me, file);
  assertAthleteAccess(scope, athleteId);
  const coach = canCoachAthlete(scope, athleteId);
  if (writeCoach && !coach)
    throw new Error("Only an assigned instructor or admin can prescribe or review training.");
  return { me, file, coach };
}
export async function trainingBrief(sql: Sql, athleteId: string) {
  const assignments =
    await sql<TrainingAssignment>`select * from training_assignments where athlete_id=${athleteId} order by created_at desc`;
  const logs =
    await sql<TrainingLog>`select * from training_practice_logs where athlete_id=${athleteId} order by updated_at desc`;
  const events = await sql<{
    id: number;
    assignment_id: string;
    kind: string;
    document: { feedback?: string; action?: string };
    created_at: Date;
  }>`select id,assignment_id,kind,document,created_at from home_training_events where athlete_id=${athleteId} order by id desc limit 100`;
  return { assignments, logs, events };
}
async function recordedDevelopmentEvidence(
  sql: Sql,
  file: Awaited<ReturnType<typeof readWorkingFile>>,
  athleteId: string,
) {
  const context = developmentEvidence(file, athleteId, chicagoDate(new Date()));
  const assessments = await sql<{
    id: string;
    discipline: string;
    completed_at: Date;
    notes: string;
  }>`select id,discipline,completed_at,notes from athlete_assessments where athlete_id=${athleteId} order by completed_at desc limit 8`;
  for (const a of assessments)
    context.evidence.push({
      id: a.id,
      kind: "Completed service assessment",
      date: new Date(a.completed_at).toISOString().slice(0, 10),
      text: `${a.discipline}: ${a.notes}`,
      source: "coach record",
    });
  if (assessments.length) context.missing = context.missing.filter((m) => m !== "Coach evaluation");
  return context;
}
export async function loadTrainingForUser(userId: string, athleteId: string) {
  const sql = await getSql(),
    { coach, file, me } = await authority(sql, userId, athleteId);
  const athlete = file.athletes.find((a) => a.id === athleteId);
  const [a] = await sql<{
    birth_date: string | null;
  }>`select birth_date::text from club_athletes where id=${athleteId}`;
  const age = a?.birth_date ? ageOnClubDay(a.birth_date, chicagoDate(new Date())) : null;
  const brief = await trainingBrief(sql, athleteId);
  return {
    coach,
    admin: me.role === "admin",
    context: coach ? await recordedDevelopmentEvidence(sql, file, athleteId) : null,
    workload: coach
      ? developmentWorkload(
          file,
          athleteId,
          brief.assignments,
          brief.logs,
          chicagoDate(new Date()),
          athlete?.sport || "",
          age,
        )
      : null,
    drills: await approvedDrills(sql),
    age,
    athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : "Player",
    sport: athlete?.sport || "",
    goals: file.goals
      .filter((g) => g.athleteId === athleteId)
      .map((g) => ({ title: g.title, target: g.target })),
    recentWorkload: file.workload.filter((w) => w.athleteId === athleteId).slice(-14),
    ...brief,
    assignments: brief.assignments.map((a) =>
      coach
        ? a
        : { ...a, document: { ...a.document, evidence: undefined, workloadSnapshot: undefined } },
    ),
    events: brief.events.filter((e) => coach || e.kind !== "quality review"),
  };
}
async function event(
  sql: Sql,
  userId: string,
  a: TrainingAssignment,
  kind: string,
  document: unknown,
) {
  await sql`insert into home_training_events(athlete_id,assignment_id,actor_id,kind,document) values(${a.athlete_id},${a.id},${userId},${kind},${JSON.stringify(document)}::jsonb)`;
}
export async function assignTrainingForUser(userId: string, raw: AssignmentInput) {
  const input = assignmentInput.parse(raw),
    sql = await getSql(),
    identity = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    const { me, file } = await authority(tx, userId, input.athleteId, true, identity);
    // Serializes competing instructor assignments and readiness changes for one athlete.
    const [athlete] = await tx<{
      birth_date: string | null;
      profile: { sport?: string; sports?: string[] };
    }>`select birth_date::text,profile from club_athletes where id=${input.athleteId} for update`;
    const [existing] =
      await tx<TrainingAssignment>`select * from training_assignments where id=${input.id}`;
    if (existing) {
      if (existing.athlete_id !== input.athleteId || existing.created_by !== userId)
        throw new Error("Assignment ID already used.");
      if (
        Object.keys(input).some(
          (k) =>
            !isDeepStrictEqual(
              existing.document[k as keyof AssignmentInput],
              input[k as keyof AssignmentInput],
            ),
        )
      )
        throw new Error("This assignment was already saved with different content. Reload.");
      return existing;
    }
    if (!athlete?.birth_date)
      throw new Error("A recorded birthday is required; age is not inferred.");
    const age = ageOnClubDay(athlete.birth_date, input.startDate);
    if (age < 5 || age > 100)
      throw new Error("This catalog requires an age of five or older and an individual review.");
    const sports = [
      athlete.profile?.sport,
      ...(athlete.profile?.sports || []),
      file.athletes.find((a) => a.id === input.athleteId)?.sport,
    ];
    if (!sports.includes(input.sport)) throw new Error("Choose a sport recorded for this athlete.");
    const brief = await trainingBrief(tx, input.athleteId);
    if (brief.assignments.some((a) => a.status === "paused"))
      throw new Error("Resolve the existing training hold before assigning more activity.");
    const activeIds = brief.assignments
      .filter((a) => a.status === "active")
      .map((a) => a.id)
      .sort();
    if (!isDeepStrictEqual(activeIds, [...input.reviewedAssignmentIds].sort()))
      throw new Error(
        "Assigned workload changed. Reload and review all current programs before publishing.",
      );
    const library = await approvedDrills(tx);
    const drills = [...new Set(input.tasks.map((t) => t.drillId))].map((id) => {
      const d = library.find((d) => d.id === id);
      if (
        !d ||
        d.discipline !== input.discipline ||
        !d.sports.includes(input.sport) ||
        d.minAge > age ||
        d.minimumSkill > skillBands.indexOf(input.skill)
      )
        throw new Error(
          "A drill is incompatible with this sport, discipline, age or reviewed skill level.",
        );
      return d;
    });
    const family = programFamilies.find(
      (p) => p.sport === input.sport && p.discipline === input.discipline,
    )!;
    const program = input.programId
      ? developmentPrograms.find((p) => p.id === input.programId)
      : undefined;
    if (
      input.programId &&
      (!program ||
        program.discipline !== input.discipline ||
        !compatibleProgram(program, input.sport, age, skillBands.indexOf(input.skill), library))
    )
      throw new Error(
        "Program prerequisites do not match this athlete's reviewed age, sport or skill.",
      );
    if (
      program &&
      input.tasks.some(
        (t) => t.phase === undefined || !program.phases[t.phase].drillIds.includes(t.drillId),
      )
    )
      throw new Error(
        "Program tasks must retain compatible phase sequences. Use a custom plan for substitutions.",
      );
    const workloadSnapshot = developmentWorkload(
      file,
      input.athleteId,
      brief.assignments,
      brief.logs,
      chicagoDate(new Date()),
      input.sport,
      age,
    );
    if (
      input.discipline === "Pitching" &&
      workloadSnapshot.restUntil &&
      input.tasks.some((t) => t.date < workloadSnapshot.restUntil!)
    )
      throw new Error(
        `Recorded baseball pitching rest runs until ${workloadSnapshot.restUntil}. Schedule pitching after the restriction and confirm readiness.`,
      );
    const document = {
      ...input,
      ...(program ? { program } : {}),
      evidence: (await recordedDevelopmentEvidence(tx, file, input.athleteId)).evidence,
      workloadSnapshot,
      age,
      ageBand: ageBand(age),
      version: TRAINING_VERSION,
      coachName: me.name,
      phases: program ? program.phases.map((p) => p.name) : family.phases,
      drills,
      phase: 0,
    };
    const [a] =
      await tx<TrainingAssignment>`insert into training_assignments(id,athlete_id,created_by,status,document) values(${input.id},${input.athleteId},${userId},'active',${JSON.stringify(document)}::jsonb) returning *`;
    await event(tx, userId, a, "assigned", {
      reason: input.reason,
      qualifiedReview: true,
      workload: input.workload,
      otherActivePrograms: brief.assignments.filter((a) => a.status === "active").map((a) => a.id),
    });
    return a;
  });
}
export async function logTrainingForUser(userId: string, raw: PracticeInput) {
  const input = practiceInput.parse(raw),
    sql = await getSql(),
    identity = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    const [initial] =
      await tx<TrainingAssignment>`select * from training_assignments where id=${input.assignmentId}`;
    if (!initial) throw new Error("Training assignment unavailable.");
    const { coach } = await authority(tx, userId, initial.athlete_id, false, identity);
    await tx`select id from club_athletes where id=${initial.athlete_id} for update`;
    const [a] =
      await tx<TrainingAssignment>`select * from training_assignments where id=${input.assignmentId} for update`;
    if (!a.document.tasks.some((t) => t.id === input.taskId))
      throw new Error("This task is not assigned to this player.");
    const [old] =
      await tx<TrainingLog>`select * from training_practice_logs where assignment_id=${a.id} and task_id=${input.taskId}`;
    if (
      old &&
      Object.keys(input)
        .filter((k) => k !== "revision")
        .every(
          (k) =>
            JSON.stringify(old.document[k as keyof PracticeInput]) ===
            JSON.stringify(input[k as keyof PracticeInput]),
        )
    )
      return old;
    if (old?.document.source === "coach-observed" && !coach)
      throw new Error("Coach observations cannot be overwritten by self-reports.");
    if (a.document.tasks.find((t) => t.id === input.taskId)!.date > chicagoDate(new Date()))
      throw new Error("Future practice cannot be recorded as completed.");
    if ((old?.revision || 0) !== input.revision)
      throw new Error("Practice changed. Reload before saving again.");
    if (a.status !== "active" && !input.pain && input.fatigue !== "unusual")
      throw new Error("This program is on hold or closed. Contact your coach.");
    const task = a.document.tasks.find((t) => t.id === input.taskId)!;
    if (
      task.phase !== undefined &&
      task.phase > a.document.phase &&
      !input.pain &&
      input.fatigue !== "unusual"
    )
      throw new Error(
        "This phase needs coach approval before activity begins. Follow the current phase or ask your coach to adjust the plan.",
      );
    const document = {
      ...input,
      phase: a.document.phase,
      source: coach ? "coach-observed" : "self-reported",
    };
    const [log] =
      await tx<TrainingLog>`insert into training_practice_logs(id,assignment_id,athlete_id,task_id,actor_id,document) values(${old?.id || randomUUID()},${a.id},${a.athlete_id},${input.taskId},${userId},${JSON.stringify(document)}::jsonb) on conflict(assignment_id,task_id) do update set document=excluded.document,actor_id=excluded.actor_id,revision=training_practice_logs.revision+1,updated_at=now() returning *`;
    await event(tx, userId, a, "practice", document);
    if (input.pain || input.fatigue === "unusual") {
      const held =
        await tx<TrainingAssignment>`update training_assignments set status='paused',revision=revision+1,updated_at=now() where athlete_id=${a.athlete_id} and status='active' returning *`;
      for (const hold of held)
        await event(tx, userId, hold, "safety hold", {
          feedback:
            "Activity stopped: pain or unusual fatigue reported. Guardian and coach: review before resuming. Seek appropriate clinical advice for pain; this app does not provide clearance.",
        });
    }
    return log;
  });
}
export async function reviewTrainingForUser(userId: string, raw: TrainingReviewInput) {
  const input = trainingReviewInput.parse(raw),
    sql = await getSql(),
    identity = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    const [initial] =
      await tx<TrainingAssignment>`select * from training_assignments where id=${input.assignmentId}`;
    if (!initial) throw new Error("Training assignment unavailable.");
    await authority(tx, userId, initial.athlete_id, true, identity);
    await tx`select id from club_athletes where id=${initial.athlete_id} for update`;
    const [a] =
      await tx<TrainingAssignment>`select * from training_assignments where id=${input.assignmentId} for update`;
    if (a.revision !== input.revision)
      throw new Error("Training changed. Reload before reviewing.");
    if (a.status === "completed" || a.status === "discontinued")
      throw new Error("Closed programs are historical. Create a new reviewed assignment.");
    if (
      a.status === "paused" &&
      !["pause", "discontinue"].includes(input.action) &&
      !input.safetyReviewed
    )
      throw new Error(
        "Document review of the hold and any required professional clearance before resuming.",
      );
    const logs =
      await tx<TrainingLog>`select * from training_practice_logs where assignment_id=${a.id}`;
    if (
      ["advance", "complete"].includes(input.action) &&
      !logs.some(
        (l) =>
          (l.document.phase ?? 0) === a.document.phase &&
          l.document.source === "coach-observed" &&
          !l.document.pain &&
          l.document.fatigue !== "unusual",
      )
    )
      throw new Error(
        "Record a coach-observed reassessment before advancing or completing. Time elapsed and self-reports alone do not establish mastery.",
      );
    const status =
      input.action === "pause"
        ? "paused"
        : input.action === "complete"
          ? "completed"
          : input.action === "discontinue"
            ? "discontinued"
            : "active";
    const document = {
      ...a.document,
      phase: input.action === "advance" ? Math.min(3, a.document.phase + 1) : a.document.phase,
    };
    const [next] =
      await tx<TrainingAssignment>`update training_assignments set status=${status},document=${JSON.stringify(document)}::jsonb,revision=revision+1,updated_at=now() where id=${a.id} returning *`;
    await event(tx, userId, a, "coach review", input);
    return next;
  });
}

export async function trainingInboxForUser(userId: string) {
  const sql = await getSql(),
    me = await resolveIdentity(sql, userId),
    file = await readWorkingFile(sql),
    scope = scopeForViewer(me, file);
  const ids = scope.athleteIds === "all" ? file.athletes.map((a) => a.id) : [...scope.athleteIds];
  if (!ids.length) return [];
  const rows = await sql<{
    id: string;
    athlete_id: string;
    status: string;
    document: TrainingAssignment["document"];
  }>`select id,athlete_id,status,document from training_assignments where athlete_id=any(${ids}::text[]) and status='paused' order by updated_at desc`;
  return rows.map((a) => ({
    id: a.id,
    athleteId: a.athlete_id,
    name: file.athletes.find((x) => x.id === a.athlete_id)?.firstName || "Player",
    title: a.document.title,
    message:
      "Training is on hold. Stop the affected activity. Guardian and assigned coach: open My Training to review the report and any required professional clearance.",
  }));
}
export async function trainingQualityForUser(userId: string, athleteId: string) {
  const sql = await getSql(),
    { me } = await authority(sql, userId, athleteId, true);
  if (me.role !== "admin")
    throw new Error("Only an administrator can inspect the academy quality review.");
  const brief = await trainingBrief(sql, athleteId);
  const lessons = await sql<{
    id: string;
    booking_id: string;
    status: string;
    document: {
      objective?: string;
      familyRecap?: string;
      homework?: string;
      nextSteps?: string;
      logs?: unknown[];
    };
    published_at: Date | null;
  }>`select id,booking_id,status,document,published_at from guided_lesson_sessions where athlete_id=${athleteId} order by updated_at desc limit 30`;
  return {
    lessons: lessons.map((l) => ({
      id: l.id,
      bookingId: l.booking_id,
      status: l.status,
      objective: l.document.objective || "",
      recap: l.document.familyRecap || "",
      homework: l.document.homework || "",
      nextSteps: l.document.nextSteps || "",
      practiceRecords: l.document.logs?.length || 0,
    })),
    plans: brief.assignments.map((a) => ({
      id: a.id,
      title: a.document.title,
      coach: a.document.coachName,
      reason: a.document.reason,
      goal: a.document.goal,
      baseline: a.document.baseline,
      workload: a.document.workload,
      reviewDate: a.document.reviewDate,
      qualifiedReview: a.document.qualifiedReview,
      drills: a.document.drills.map((d) => ({ name: d.name, purpose: d.purpose })),
      observations: brief.logs.filter(
        (l) => l.assignment_id === a.id && l.document.source === "coach-observed",
      ).length,
    })),
    reviews: brief.events.filter((e) => e.kind === "quality review"),
  };
}
export async function reviewTrainingQualityForUser(
  userId: string,
  input: { assignmentId: string; requestId: string; feedback: string; checks: string[] },
) {
  const sql = await getSql(),
    identity = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    const [a] =
      await tx<TrainingAssignment>`select * from training_assignments where id=${input.assignmentId} for update`;
    if (!a) throw new Error("Assignment unavailable.");
    const { me } = await authority(tx, userId, a.athlete_id, true, identity);
    if (me.role !== "admin")
      throw new Error("Only an administrator can record academy quality feedback.");
    const prior =
      await tx`select id from home_training_events where assignment_id=${a.id} and kind='quality review' and document->>'requestId'=${input.requestId}`;
    if (prior.length) return { ok: true };
    await tx`select set_config('app.actor_id',${userId},true)`;
    await event(tx, userId, a, "quality review", input);
    return { ok: true };
  });
}
