import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { readWorkingFile } from "./desk-impl.server";
import { scopeForViewer, assertAthleteAccess, canCoachAthlete } from "./access";
import { ageOnClubDay } from "./engines";
import { chicagoDate } from "../scheduling";
import {
  ageBand,
  skillBands,
  trainingDrills,
  programFamilies,
  TRAINING_VERSION,
} from "./training-catalog";
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
export async function loadTrainingForUser(userId: string, athleteId: string) {
  const sql = await getSql(),
    { coach, file } = await authority(sql, userId, athleteId);
  const athlete = file.athletes.find((a) => a.id === athleteId);
  const [a] = await sql<{
    birth_date: string | null;
  }>`select birth_date::text from club_athletes where id=${athleteId}`;
  const age = a?.birth_date ? ageOnClubDay(a.birth_date, chicagoDate(new Date())) : null;
  return {
    coach,
    age,
    athleteName: athlete ? `${athlete.firstName} ${athlete.lastName}` : "Player",
    sport: athlete?.sport || "",
    goals: file.goals
      .filter((g) => g.athleteId === athleteId)
      .map((g) => ({ title: g.title, target: g.target })),
    recentWorkload: file.workload.filter((w) => w.athleteId === athleteId).slice(-14),
    ...(await trainingBrief(sql, athleteId)),
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
    const drills = [...new Set(input.tasks.map((t) => t.drillId))].map((id) => {
      const d = trainingDrills.find((d) => d.id === id);
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
    const document = {
      ...input,
      age,
      ageBand: ageBand(age),
      version: TRAINING_VERSION,
      coachName: me.name,
      phases: family.phases,
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
    const document = { ...input, source: coach ? "coach-observed" : "self-reported" };
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
