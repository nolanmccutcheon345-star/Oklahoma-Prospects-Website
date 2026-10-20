import type { Sql } from "../db";
import {
  loadFinancialLessonsInTransaction,
  type FinancialContext,
  type FinancialLessonContext,
} from "./context.server";
import type { Payable } from "./contracts";
export function isScopedFinancialAccount(context: FinancialContext) {
  return (
    context.principal.admittedAgreementIds !== undefined ||
    context.principal.admittedTeamIds !== undefined
  );
}
function attributedInstructor(
  lesson: Extract<FinancialLessonContext, { mode: "basis" }>,
  bookingId: string,
) {
  return String(
    lesson.compensation.earnings.find((e) => e.booking_id === bookingId)?.coach_id ||
      lesson.booking?.coach_id ||
      "",
  );
}
function authorizedLesson(
  context: FinancialContext,
  lesson: FinancialLessonContext,
  bookingId: string,
  payeeId?: string,
) {
  if (lesson.mode !== "basis" || !lesson.booking) return false;
  return Boolean(
    context.basis?.inputs.billing.instructorAccess?.some(
      (a) =>
        a.userId === context.principal.userId &&
        (!payeeId || a.payeeId === payeeId) &&
        a.coachId === attributedInstructor(lesson, bookingId) &&
        (lesson.version >= a.fromVersion ||
          a.bookingIds.includes(bookingId) ||
          a.orderIds.includes(String(lesson.booking?.order_id || ""))),
    ),
  );
}
export async function financialSelfAllowedPayableIdsInTransaction(
  tx: Sql,
  context: FinancialContext,
  rows: Pick<Payable, "id" | "payeeId" | "teamId">[],
) {
  if (!context.basis || !isScopedFinancialAccount(context)) return new Set(rows.map((r) => r.id));
  const lessonIds = rows.filter((r) => r.id.startsWith("lesson:")).map((r) => r.id.slice(7)),
    lessons = await loadFinancialLessonsInTransaction(tx, lessonIds, context);
  const allowed = new Set<string>();
  for (const row of rows) {
    if (row.teamId && context.principal.admittedTeamIds?.includes(row.teamId)) allowed.add(row.id);
    if (
      row.id.startsWith("lesson:") &&
      authorizedLesson(context, lessons.get(row.id.slice(7))!, row.id.slice(7), row.payeeId)
    )
      allowed.add(row.id);
    if (
      context.basis.inputs.billing.payrollAccess?.some(
        (a) =>
          a.userId === context.principal.userId &&
          a.payeeId === row.payeeId &&
          row.id === `staff:${row.id.slice(6, 13)}:${a.userId}` &&
          /^staff:\d{4}-(0[1-9]|1[0-2]):/.test(row.id) &&
          row.id.slice(6, 13) >= a.fromMonth,
      )
    )
      allowed.add(row.id);
  }
  return allowed;
}
/** true means explicitly authorized; false retains the original captured-account path. */
export function assertFinancialInstructorRecognition(
  context: FinancialContext,
  lesson: FinancialLessonContext,
  bookingId: string,
) {
  if (context.principal.owner) return true;
  if (!context.basis) return false;
  if (!context.basis.inputs.billing.accounts.some((a) => a.id === context.principal.userId))
    throw Error("Explicit financial instructor admission is required.");
  if (!isScopedFinancialAccount(context)) return false;
  if (!authorizedLesson(context, lesson, bookingId))
    throw Error("This lesson is outside the admitted financial instructor scope.");
  return true;
}
