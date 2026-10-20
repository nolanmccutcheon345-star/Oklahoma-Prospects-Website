import { operationalInstructionFor } from "../operational-instruction.server";
import type { Sql } from "../db";
import { audit, requireOrganizationOperations } from "../coordinator/access.server";
import {
  financialSourceModeInTransaction,
  lockFinancialExecution,
} from "../finance/context.server";
import {
  operationalLessonCompletionInput,
  type OperationalLessonCompletion,
} from "./operational-lesson-contracts";

/** A nonfinancial observation only. Never modifies the commerce booking,
 * check-in, assessments used for purchase eligibility, or guided evidence. */
export async function operationalLessonCompletions(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireOrganizationOperations(tx, userId);
    const canRecord = (await financialSourceModeInTransaction(tx)) === "basis";
    const rows = await tx<{
      id: string;
      service: string;
      player: string | null;
      ends_at: Date;
      starts_at: Date;
      recorded: boolean;
      has_draft: boolean;
    }>`select b.id,s.name as service,a.name as player,b.starts_at,b.ends_at,
      exists(select 1 from operational_lesson_completions c where c.booking_id=b.id) as recorded,
      exists(select 1 from guided_lesson_sessions g where g.booking_id=b.id and g.status<>'published') as has_draft
      from operational_booking_schedule b join club_services s on s.id=b.product_id and s.kind='lesson'
      left join club_athletes a on a.id=b.athlete_id
      where b.status in ('confirmed','completed') and b.ends_at<=now()
      order by b.ends_at desc,b.id limit 100`;
    return {
      canRecord,
      lessons: rows.map((r) => ({
        id: r.id,
        service: r.service,
        player: r.player || "Player not listed",
        startsAt: new Date(r.starts_at).toISOString(),
        endsAt: new Date(r.ends_at).toISOString(),
        recorded: r.recorded,
        requiresGuidedReview: r.has_draft,
      })),
    };
  });
}
export async function recordOperationalLessonCompletion(
  sql: Sql,
  userId: string,
  input: OperationalLessonCompletion,
) {
  const value = operationalLessonCompletionInput.parse(input);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireOrganizationOperations(tx, userId);
    if ((await financialSourceModeInTransaction(tx)) !== "basis")
      throw Error(
        "Independent operational lesson completion is awaiting financial cutover review.",
      );
    return recordCompletion(tx, userId, value, null);
  });
}
export async function recordInstructorAttendance(
  sql: Sql,
  userId: string,
  input: OperationalLessonCompletion,
) {
  const value = operationalLessonCompletionInput.parse(input);
  return sql.transaction(async (tx) => {
    const grant = await operationalInstructionFor(tx, userId, "attendance");
    if (!grant) throw new Error("An active operational instructor assignment is required.");
    return recordCompletion(tx, userId, value, grant.coachId);
  });
}
async function recordCompletion(
  tx: Sql,
  userId: string,
  value: OperationalLessonCompletion,
  coachId: string | null,
) {
  await tx`select id from booking_records where id=${value.bookingId} for share`;
  const [booking] = await tx<{
    id: string;
    ends_at: Date;
    status: string;
  }>`select b.id,b.ends_at,b.status
      from operational_booking_schedule b join club_services s on s.id=b.product_id and s.kind='lesson' where b.id=${value.bookingId} and (${coachId}::text is null or b.coach_id=${coachId})`;
  if (
    !booking ||
    !["confirmed", "completed"].includes(booking.status) ||
    new Date(booking.ends_at) > new Date()
  )
    throw Error("Only an ended, confirmed lesson can receive an attendance observation.");
  if (new Date(booking.ends_at).toISOString() !== value.expectedEndsAt)
    throw Error("The lesson changed. Refresh before recording attendance.");
  const [existing] =
    await tx`select booking_id from operational_lesson_completions where booking_id=${value.bookingId}`;
  if (existing) return { ok: true, recorded: false };
  const [draft] =
    await tx`select id from guided_lesson_sessions where booking_id=${value.bookingId} and status<>'published'`;
  if (draft)
    throw Error(
      "This lesson has unpublished guided evidence. It requires owner classification and review before a separate completion observation.",
    );
  await tx`insert into operational_lesson_completions(booking_id,attendance,recap,completed_by)
      values(${value.bookingId},${value.attendance},${value.recap},${userId})`;
  await audit(tx, userId, "organization.lessons.observe-completion", value.bookingId, "allowed");
  return { ok: true, recorded: true };
}
