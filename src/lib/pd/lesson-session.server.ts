import {
  operationalInstructionFor,
  operationalLessonViewer,
  type OperationalLessonViewer,
} from "../operational-instruction.server";
import { emptyDevelopment } from "./empty";
import { lockFinancialExecution } from "../finance/execution.server";
import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { resolveIdentity } from "../identity.server";
import { readWorkingFile } from "./desk-impl.server";
import { assignedCoachIdFor } from "../commerce/coach-access.server";
import { completeSessionInTransaction } from "../commerce/portal.server";
import {
  blankLessonDocument,
  lessonDocument,
  resolveTemplate,
  disciplineFor,
  lessonSports,
  type LessonDocument,
  type LessonSport,
} from "./lesson-templates";
import { ageOnClubDay } from "./engines";
import { chicagoDate } from "../scheduling";

type Config = {
  service: {
    id: string;
    name: string;
    discipline: string;
    minutes: number;
    lesson_version: number;
  };
  sport: LessonSport | null;
  source: string;
  capturedAt?: string;
};
type BookingRow = {
  id: string;
  athlete_id: string;
  coach_id: string;
  product_id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  completion_recap: string | null;
  lesson_config: Config | null;
  household_id: string | null;
};
type Snapshot = {
  bookingStatus: string;
  bookingId: string;
  athleteId: string;
  instructorId: string;
  service: Config;
  startsAt: string;
  endsAt: string;
  template: ReturnType<typeof resolveTemplate>;
  context: Awaited<ReturnType<typeof athleteContext>>;
};
type Session = {
  id: string;
  booking_id: string;
  athlete_id: string;
  instructor_id: string;
  revision: number;
  status: "draft" | "published";
  snapshot: Snapshot;
  document: LessonDocument;
  operational_author_id: string | null;
  updated_by: string;
};
async function access(
  tx: Sql,
  me: Awaited<ReturnType<typeof resolveIdentity>> | OperationalLessonViewer,
  id: string,
  lock = false,
) {
  const operationalOnly = me.role !== "admin" && me.role !== "coach" && !me.canInstruct;
  const grant = operationalOnly
    ? await operationalInstructionFor(tx, me.userId, "lesson-draft")
    : null;
  if (operationalOnly && !grant) throw new Error("Instructor access required.");
  // Operational access never loads the mixed financial/player-development file.
  const file = operationalOnly ? emptyDevelopment() : await readWorkingFile(tx),
    coachId = grant?.coachId || assignedCoachIdFor(me, file);
  if (lock) await tx`select id from booking_records where id=${id} for update`;
  const rows = await tx.query<BookingRow>(
    `select * from operational_booking_schedule where id=$1`,
    [id],
  );
  const booking = rows[0];
  if (
    !booking ||
    !booking.athlete_id ||
    !booking.coach_id ||
    (me.role !== "admin" && booking.coach_id !== coachId)
  )
    throw new Error("Only the assigned instructor or an admin can open this lesson.");
  return { me, file, booking, operationalOnly };
}
async function athleteContext(
  tx: Sql,
  file: Awaited<ReturnType<typeof readWorkingFile>>,
  athleteId: string,
  date: string,
  operationalOnly = false,
) {
  const [a] = await tx<{
    name: string;
    birth_date: string | null;
  }>`select name,birth_date::text from club_athletes where id=${athleteId}`;
  if (!a) throw new Error("The booked player record is missing. Contact Front Office.");
  const age = a.birth_date ? ageOnClubDay(a.birth_date, date) : null;
  if (age === null || !Number.isFinite(age) || age < 3 || age > 100)
    throw new Error(
      "A valid private player birthday is needed to choose age-appropriate training. Ask the guardian to update the player profile.",
    );
  const player = file.athletes.find((a) => a.id === athleteId);
  // This grant does not classify pre-existing private narratives. New operational
  // drafts receive only the booked athlete and age-appropriate template inputs.
  if (operationalOnly)
    return {
      name: a.name,
      age,
      level: player?.opLevel || 1,
      goals: [],
      priorities: [],
      recentLessons: [],
      assessments: [],
      workload: [],
      throwingPlans: [],
      notes: "",
    };
  const pick = <T extends { athleteId: string; date?: string; createdAt?: string }>(rows: T[]) =>
    rows
      .filter((r) => r.athleteId === athleteId)
      .sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""))
      .slice(0, 8);
  const assessments = await tx<{
    discipline: string;
    completed_at: Date;
    notes: string;
  }>`select discipline,completed_at,notes from athlete_assessments where athlete_id=${athleteId} order by completed_at desc limit 5`;
  return {
    name: a.name,
    age,
    level: player?.opLevel || 1,
    goals: pick(file.goals),
    priorities: pick(file.plans),
    recentLessons: pick(file.lessons),
    assessments,
    workload: pick(file.workload),
    throwingPlans: pick(file.throwingAssignments),
    notes: player?.notes || "",
  };
}
function assertOperationalDraft(session: Session, userId: string, operationalOnly: boolean) {
  if (
    operationalOnly &&
    (session.operational_author_id !== userId ||
      session.updated_by !== userId ||
      session.status !== "draft")
  )
    throw new Error(
      "This existing lesson contains unreviewed history. An owner must review it before operational instructor access.",
    );
}
function checkSnapshot(booking: BookingRow, session: Session) {
  if (
    session.instructor_id !== booking.coach_id ||
    session.athlete_id !== booking.athlete_id ||
    session.snapshot.service.service.id !== booking.product_id ||
    session.snapshot.startsAt !== new Date(booking.starts_at).toISOString() ||
    session.snapshot.endsAt !== new Date(booking.ends_at).toISOString()
  )
    throw new Error(
      "Booking details changed after this lesson started. Ask an admin to review the saved draft; it has not been overwritten.",
    );
}
export async function openLessonSession(userId: string, bookingId: string) {
  return openLessonSessionFor(await getSql(), userId, bookingId);
}
export async function openLessonSessionFor(sql: Sql, userId: string, bookingId: string) {
  const identity =
    (await operationalLessonViewer(sql, userId)) ?? (await resolveIdentity(sql, userId));
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const { me, file, booking, operationalOnly } = await access(tx, identity, bookingId, true);
    const [existing] =
      await tx<Session>`select * from guided_lesson_sessions where booking_id=${bookingId}`;
    if (existing) {
      assertOperationalDraft(existing, userId, operationalOnly);
      checkSnapshot(booking, existing);
      return {
        operationalOnly,
        session: existing,
        bookingStatus: booking.status,
        canReview: me.role === "admin",
        resolutionError: null,
        athleteName: existing.snapshot.context.name as string,
        instructorName:
          file.coaches.find((coach) => coach.id === booking.coach_id)?.name ||
          "Assigned instructor",
      };
    }
    if (booking.status === "completed")
      return {
        operationalOnly,
        session: null,
        bookingStatus: booking.status,
        canReview: false,
        resolutionError: null,
        athleteName: "",
        legacyCompleted: {
          recap:
            (!operationalOnly && booking.completion_recap) ||
            (operationalOnly
              ? "This historical lesson requires owner review."
              : "No booking recap recorded. Review the existing player development history."),
          bookingId: booking.id,
        },
      };
    if (booking.status !== "confirmed")
      throw new Error(
        "Only confirmed bookings can start a new guided lesson. Existing history is unchanged.",
      );
    const savedConfig = booking.lesson_config;
    // Purchased snapshots can contain prices and payout terms beyond the
    // TypeScript shape. Project keys explicitly for operational-only sessions.
    const config: Config | null =
      operationalOnly && savedConfig?.service
        ? {
            service: {
              id: savedConfig.service.id,
              name: savedConfig.service.name,
              discipline: savedConfig.service.discipline,
              minutes: savedConfig.service.minutes,
              lesson_version: savedConfig.service.lesson_version,
            },
            sport: savedConfig.sport,
            source: "operational-instructor-template",
          }
        : savedConfig;
    if (!config || !lessonSports.includes(config.sport as LessonSport))
      return {
        operationalOnly,
        session: null,
        bookingStatus: booking.status,
        canReview: me.role === "admin",
        resolutionError:
          "The booked sport or original service configuration is not recorded. Front Office must review this booking before a lesson starts.",
        athleteName: "",
      };
    const duration = (+new Date(booking.ends_at) - +new Date(booking.starts_at)) / 60000;
    if (
      !config.service ||
      config.service.id !== booking.product_id ||
      duration !== Number(config.service.minutes)
    )
      return {
        operationalOnly,
        session: null,
        bookingStatus: booking.status,
        canReview: me.role === "admin",
        resolutionError:
          "The booked duration conflicts with its saved service configuration. Review the original booking and document the correct service before starting.",
        athleteName: "",
      };
    const context = await athleteContext(
      tx,
      file,
      booking.athlete_id,
      chicagoDate(new Date(booking.starts_at)),
      operationalOnly,
    );
    const priorities = [
      JSON.stringify(context.goals),
      JSON.stringify(context.priorities),
      JSON.stringify(context.recentLessons),
      JSON.stringify(context.assessments),
      context.notes,
    ];
    const template = resolveTemplate(
      config.sport!,
      disciplineFor(config.service.discipline),
      duration,
      context.age,
      context.level,
      priorities,
    );
    const snapshot: Snapshot = {
      bookingStatus: booking.status,
      bookingId,
      athleteId: booking.athlete_id,
      instructorId: booking.coach_id,
      service: config,
      startsAt: new Date(booking.starts_at).toISOString(),
      endsAt: new Date(booking.ends_at).toISOString(),
      template,
      context,
    };
    const document = blankLessonDocument();
    document.objective = template.objective;
    const [session] =
      await tx<Session>`insert into guided_lesson_sessions(id,booking_id,athlete_id,instructor_id,snapshot,document,created_by,updated_by,operational_author_id) values(${randomUUID()},${bookingId},${booking.athlete_id},${booking.coach_id},${JSON.stringify(snapshot)}::jsonb,${JSON.stringify(document)}::jsonb,${userId},${userId},${operationalOnly ? userId : null}) returning *`;
    return {
      operationalOnly,
      session,
      bookingStatus: booking.status,
      canReview: me.role === "admin",
      resolutionError: null,
      athleteName: context.name,
      instructorName:
        file.coaches.find((coach) => coach.id === booking.coach_id)?.name || "Assigned instructor",
    };
  });
}
export async function reviewLegacyLesson(
  userId: string,
  input: { bookingId: string; sport: LessonSport; discipline: string; reason: string },
) {
  const sql = await getSql(),
    identity = await resolveIdentity(await getSql(), userId);
  return sql.transaction(async (tx) => {
    const { me, booking } = await access(tx, identity, input.bookingId, true);
    if (me.role !== "admin") throw new Error("Admin review required.");
    if (booking.status !== "confirmed")
      throw new Error(
        "Review is only available for confirmed, unstarted lessons. Historical records are not rewritten.",
      );
    if ((await tx`select id from guided_lesson_sessions where booking_id=${booking.id}`).length)
      throw new Error(
        "This lesson already has a saved snapshot. Review its exception before making corrections.",
      );
    const [service] = await tx<{
      id: string;
      name: string;
      discipline: string;
      minutes: number;
      lesson_version: number;
    }>`select id,name,discipline,minutes,lesson_version from club_services where id=${booking.product_id} and kind='lesson'`;
    if (!service) throw new Error("The booked service is not a lesson.");
    const minutes = (+new Date(booking.ends_at) - +new Date(booking.starts_at)) / 60000;
    resolveTemplate(input.sport, disciplineFor(input.discipline), minutes, 12, 1);
    if (input.reason.trim().length < 10)
      throw new Error("Document how you confirmed the original service and sport.");
    // Explicit reviewed resolution; never claim the current catalog is the purchased version.
    const config = {
      service: {
        ...service,
        minutes,
        discipline: disciplineFor(input.discipline),
        lesson_version: 0,
      },
      sport: input.sport,
      source: "admin-reviewed-legacy",
      capturedAt: new Date().toISOString(),
      reviewedBy: userId,
      reason: input.reason,
    };
    await tx`select set_config('app.actor_id',${userId},true)`;
    await tx`update booking_records set lesson_config=${JSON.stringify(config)}::jsonb,lesson_sport=${input.sport} where id=${booking.id}`;
    return { ok: true };
  });
}
export async function saveLessonSession(
  userId: string,
  input: { bookingId: string; revision: number; document: LessonDocument; complete: boolean },
) {
  return saveLessonSessionFor(await getSql(), userId, input);
}
export async function saveLessonSessionFor(
  sql: Sql,
  userId: string,
  input: { bookingId: string; revision: number; document: LessonDocument; complete: boolean },
) {
  const document = lessonDocument.parse(input.document),
    identity = (await operationalLessonViewer(sql, userId)) ?? (await resolveIdentity(sql, userId));
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const { me, file, booking, operationalOnly } = await access(
      tx,
      identity,
      input.bookingId,
      true,
    );
    if (me.role === "operational-instructor" && input.complete)
      throw new Error(
        "Operational instructor access cannot publish paid completion or recognize earnings. Save the draft for owner review.",
      );
    const [session] =
      await tx<Session>`select * from guided_lesson_sessions where booking_id=${booking.id} for update`;
    if (!session) throw new Error("Open the booked lesson before saving.");
    assertOperationalDraft(session, userId, operationalOnly);
    checkSnapshot(booking, session);
    if (session.status === "published") {
      if (input.complete && booking.status === "completed")
        return { ok: true, completed: true, revision: session.revision };
      throw new Error("Published lessons are read-only. Corrections require admin review.");
    }
    if (booking.status !== "confirmed")
      throw new Error("This booking is no longer confirmed. Its draft has been retained.");
    if (session.revision !== input.revision)
      throw new Error(
        "Another editor saved this lesson. Reload the saved draft before continuing. Your current form is still available.",
      );
    if (
      document.logs.some(
        (l) =>
          !l.drill && !l.observations && !l.outcome && !l.exercise && !l.actual && !l.execution,
      )
    )
      throw new Error("Each practice record needs an activity, result or observation.");
    if (document.logs.some((l) => l.kind !== session.snapshot.template.discipline))
      throw new Error("Tracking must match this booked discipline.");
    if (new Set(document.logs.map((l) => l.id)).size !== document.logs.length)
      throw new Error("Duplicate tracking row identifiers.");
    if (document.logs.length && new Date(booking.starts_at) > new Date())
      throw new Error(
        "Practice results cannot be recorded before the lesson starts. You can save the plan now.",
      );
    if (document.readiness === "restricted" && !document.overrideReason.trim())
      throw new Error("Document the modified plan for the athlete’s restrictions.");
    if (
      document.objective !== session.snapshot.template.objective &&
      !document.overrideReason.trim()
    )
      throw new Error("Document why you changed the planned objective.");
    if (input.complete) {
      if (document.attendance !== "present" || document.readiness === "unchecked")
        throw new Error(
          "Confirm attendance and review readiness before completing. Missed or partial sessions must stay drafts.",
        );
      if (document.familyRecap.length < 10 || !document.homework || !document.nextSteps)
        throw new Error("Add the family recap, homework (or explain none), and next steps.");
      if (document.stageNotes.some((n) => !n.trim()))
        throw new Error(
          "Document every stage, including the reason for any skipped or modified activity.",
        );
      if (!document.logs.length && !document.overrideReason.trim())
        throw new Error("Record training results or explain why tracking was not appropriate.");
      if (me.role === "operational-instructor")
        throw new Error("Financial completion requires existing instructor authority.");
      await completeSessionInTransaction(
        tx,
        me,
        file,
        booking.id,
        document.familyRecap,
        session.snapshot.template.discipline,
      );
    }
    await tx`select set_config('app.actor_id',${userId},true)`;
    const [updated] = await tx<{
      revision: number;
    }>`update guided_lesson_sessions set document=${JSON.stringify(document)}::jsonb,status=${input.complete ? "published" : "draft"},revision=revision+1,updated_by=${userId},updated_at=now(),published_at=case when ${input.complete} then now() else null end where id=${session.id} returning revision`;
    return { ok: true, completed: input.complete, revision: updated.revision };
  });
}
/** Family access deliberately excludes private instructor notes and draft results. */
export async function lessonHistory(userId: string, athleteId: string) {
  const sql = await getSql(),
    me = await resolveIdentity(sql, userId),
    file = await readWorkingFile(sql);
  const { scopeForViewer, assertAthleteAccess, canCoachAthlete } = await import("./access");
  const scope = scopeForViewer(me, file);
  assertAthleteAccess(scope, athleteId);
  const coach = canCoachAthlete(scope, athleteId);
  const rows =
    await sql<Session>`select * from guided_lesson_sessions where athlete_id=${athleteId} and status='published' order by published_at desc`;
  return rows.map((s) => ({
    id: s.id,
    bookingId: s.booking_id,
    sport: s.snapshot.template.sport,
    discipline: s.snapshot.template.discipline,
    minutes: s.snapshot.template.minutes,
    templateVersion: s.snapshot.template.version,
    date: s.snapshot.startsAt,
    document: coach
      ? s.document
      : {
          ...s.document,
          coachNotes: "",
          logs: s.document.logs.map((l) => ({ ...l, observations: "", mechanics: "" })),
          stageNotes: [],
          restrictions: "",
          overrideReason: "",
        },
  }));
}
/** Read-only candidate report, not proof that a historical lesson was misclassified. */
export async function historicalLessonExceptions(userId: string) {
  const sql = await getSql();
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Admin access required.");
  const file = await readWorkingFile(sql);
  const sessions = await sql<{
    id: string;
    booking_id: string;
    instructor_id: string;
    snapshot: Snapshot;
  }>`select s.id,s.booking_id,s.instructor_id,s.snapshot from guided_lesson_sessions s join operational_booking_schedule b on b.id=s.booking_id where s.snapshot->'service'->'service'->>'id' is distinct from b.product_id or s.instructor_id is distinct from b.coach_id or s.athlete_id is distinct from b.athlete_id or (s.snapshot->>'startsAt')::timestamptz<>b.starts_at or (s.snapshot->>'endsAt')::timestamptz<>b.ends_at`;
  const legacy = file.lessons
    .filter((l) => !/guided:/.test(l.id))
    .flatMap((l) => {
      const athlete = file.athletes.find((a) => a.id === l.athleteId);
      const pitching = file.bullpens.filter(
        (b) => b.athleteId === l.athleteId && b.date === l.date,
      );
      const fielding =
        /field|defen/i.test(l.focus + " " + l.notes) ||
        /^(ss|2b|3b|1b|of|cf|lf|rf|inf)$/i.test(athlete?.position || "");
      return fielding && pitching.length
        ? [
            {
              lessonId: l.id,
              athleteId: l.athleteId,
              date: l.date,
              reason:
                "Possible fielding/pitching mismatch: fielding context and a same-day bullpen. Verify against original notes; this is not conclusive.",
            },
          ]
        : [];
    });
  const services = await sql<{
    id: string;
    name: string;
    discipline: string;
    minutes: number;
    remote: number;
  }>`select id,name,discipline,minutes,remote from club_services where active and kind='lesson'`;
  const coverage = services.flatMap((service) =>
    lessonSports.map((sport) => {
      try {
        if (service.id === "s5")
          return {
            serviceId: service.id,
            name: service.name,
            sport,
            minutes: service.minutes,
            status: "Separate remote review workflow",
          };
        const template = resolveTemplate(
          sport,
          disciplineFor(service.discipline),
          service.minutes,
          12,
          1,
        );
        return {
          serviceId: service.id,
          name: service.name,
          sport,
          minutes: service.minutes,
          status: "Covered",
          version: template.version,
        };
      } catch (e) {
        return {
          serviceId: service.id,
          name: service.name,
          sport,
          minutes: service.minutes,
          status: (e as Error).message,
        };
      }
    }),
  );
  return {
    coverage,
    legacy,
    changedBookings: sessions.map((s) => ({
      sessionId: s.id,
      bookingId: s.booking_id,
      reason: "Booking changed after lesson snapshot; retained for reviewed correction.",
    })),
    note: "Read-only candidates. No historical records have been altered.",
  };
}
/** Replace draft curriculum only; authoritative booking/service identity is immutable. */
export async function chooseLessonForUser(
  userId: string,
  raw: import("./lesson-choices").LessonChoiceInput,
) {
  const { lessonChoiceInput, customizeLesson } = await import("./lesson-choices");
  const input = lessonChoiceInput.parse(raw),
    sql = await getSql(),
    identity = await resolveIdentity(sql, userId);
  return sql.transaction(async (tx) => {
    const { booking } = await access(tx, identity, input.bookingId, true);
    const [s] =
      await tx<Session>`select * from guided_lesson_sessions where booking_id=${booking.id} for update`;
    if (!s || s.status !== "draft" || booking.status !== "confirmed")
      throw new Error("Only an open confirmed lesson draft can change curriculum.");
    checkSnapshot(booking, s);
    if (s.revision !== input.revision)
      throw new Error("Lesson changed. Save or reload before choosing a template.");
    const library = await (await import("./training-content.server")).approvedDrills(tx);
    const template = customizeLesson(s.snapshot.template, input, library),
      snapshot = { ...s.snapshot, template },
      document = { ...s.document, objective: input.objective };
    await tx`select set_config('app.actor_id',${userId},true)`;
    await tx`update guided_lesson_sessions set snapshot=${JSON.stringify(snapshot)}::jsonb,document=${JSON.stringify(document)}::jsonb,revision=revision+1,updated_by=${userId},updated_at=now() where id=${s.id}`;
    if (input.saveAs)
      await tx`insert into instructor_lesson_presets(id,author_id,name,sport,discipline,minutes,document) values(${randomUUID()},${userId},${input.saveAs},${template.sport},${template.discipline},${template.minutes},${JSON.stringify(input)}::jsonb)`;
    return { ok: true };
  });
}
export async function lessonPresetsForUser(userId: string, bookingId: string) {
  const sql = await getSql(),
    me = await resolveIdentity(sql, userId),
    { booking } = await access(sql, me, bookingId);
  const [s] =
    await sql<Session>`select * from guided_lesson_sessions where booking_id=${booking.id}`;
  if (!s) return [];
  return sql<{
    id: string;
    name: string;
    status: string;
    document: import("./lesson-choices").LessonChoiceInput;
  }>`select id,name,status,document from instructor_lesson_presets where sport=${s.snapshot.template.sport} and discipline=${s.snapshot.template.discipline} and minutes=${s.snapshot.template.minutes} and (author_id=${userId} or status='approved' or ${me.role === "admin"}) and status<>'retired' order by created_at desc`;
}
export async function reviewLessonPresetForUser(
  userId: string,
  input: { id: string; status: "approved" | "retired"; reason: string },
) {
  const sql = await getSql(),
    me = await resolveIdentity(sql, userId);
  if (me.role !== "admin") throw new Error("Academy approval requires an admin.");
  return sql.transaction(async (tx) => {
    await tx`select set_config('app.actor_id',${userId},true)`;
    const rows =
      await tx`update instructor_lesson_presets set status=${input.status},reviewed_by=${userId},review_note=${input.reason} where id=${input.id} returning id`;
    if (!rows.length) throw new Error("Preset unavailable.");
    return { ok: true };
  });
}
