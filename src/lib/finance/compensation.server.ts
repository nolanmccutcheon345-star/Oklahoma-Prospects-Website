import { assertFinancialInstructorRecognition } from "./identity-scope.server";
import type { Sql } from "../db";
import {
  loadFinancialContextInTransaction,
  loadFinancialLessonsInTransaction,
} from "./context.server";
import { lessonRefundValue } from "../commerce/lesson-refund-value.server";

/** A separate financial command. Operational attendance never calls this.
 * Caller acquires the financial execution gate before any booking/order lock. */
export async function recognizeFinancialLessonInTransaction(
  tx: Sql,
  userId: string,
  bookingId: string,
  reason: string,
  ownerCommand = false,
) {
  const context = await loadFinancialContextInTransaction(
    tx,
    userId,
    ownerCommand ? "owner" : "read",
  );
  const financial = (await loadFinancialLessonsInTransaction(tx, [bookingId], context)).get(
    bookingId,
  )!;
  const [booking] = await tx<any>`select * from booking_records where id=${bookingId} for update`;
  if (!booking) throw Error("Lesson booking not found.");
  if (!assertFinancialInstructorRecognition(context, financial, bookingId)) {
    // Preserve the existing assigned-instructor path, with current verified,
    // enabled and financially-unrestricted security rechecked in this tx.
    const [assigned] = await tx`select c->>'id' as id from pd_working_file f
      cross join lateral jsonb_array_elements(coalesce(f.payload::jsonb->'coaches','[]'::jsonb)) c
      where f.id='club' and c->>'id'=${booking.coach_id}
        and lower(trim(c->>'email'))=${context.principal.currentEmail}
        and coalesce(c->>'active','true')<>'false'
        and (exists(select 1 from profiles where user_id=${userId} and role='coach')
          or exists(select 1 from person_profiles where user_id=${userId} and instructor=true)
          or exists(select 1 from club_staff s join club_staff_services o on o.staff_id=s.id
            where s.active=true and (s.user_id=${userId} or (s.user_id='' and lower(trim(s.email))=${context.principal.currentEmail}))))`;
    if (!assigned) throw Error("Assigned financial instructor or owner access required.");
  }
  if (financial.mode === "basis") {
    const [recognized] =
      await tx`select booking_id from financial_lesson_recognitions where booking_id=${bookingId}`;
    if (recognized) return { recognized: false };
    if (!financial.booking || financial.booking.order_id !== booking.order_id)
      throw Error("Approved financial lesson attribution is required.");
    if (
      financial.booking.status === "completed" ||
      financial.compensation.earnings.some((e) => e.booking_id === bookingId)
    )
      return { recognized: false };
  }
  const [operational] = ownerCommand
    ? await tx`select booking_id from operational_lesson_completions where booking_id=${bookingId}`
    : [];
  if (
    booking.status !== "completed" &&
    !(ownerCommand && booking.status === "confirmed" && operational)
  )
    throw Error("Review completed lesson attendance before recognizing compensation.");
  if (new Date(booking.ends_at) > new Date()) throw Error("The lesson has not ended.");
  const [order] =
    await tx<any>`select * from commerce_orders where id=${booking.order_id} for update`;
  if (!order || order.status !== "paid")
    throw Error("A verified paid order is required before recognizing this session.");
  if (financial.mode === "basis" && order.payment_provider === "square") {
    if (order.payment_environment !== "production")
      throw Error("Actual production lesson funding is required.");
    if (order.snapshot.recurring || order.snapshot.kind === "package") {
      const funding = await lessonRefundValue(tx, booking.id, order.id, order.household_id, true);
      if (funding.availableCents <= 0)
        throw Error("The lesson funding has already been returned or reserved.");
    } else {
      const [funding] = await tx<{ received: string; refunded: string }>`select
        coalesce(sum(amount_cents),0) as received,coalesce(sum(refunded_cents),0) as refunded
        from square_payments where order_id=${order.id} and environment='production' and status='COMPLETED' and purpose='base'`;
      const [external] = await tx<{
        refunded: string;
      }>`select coalesce(sum(amount_cents),0) as refunded from commerce_refunds where order_id=${order.id} and external_status='reconciled'`;
      if (
        Number(funding.received) < order.total_cents ||
        Number(funding.received) <= Number(funding.refunded) + Number(external.refunded)
      )
        throw Error("Verify the lesson's current paid funding before recognition.");
    }
    const [pending] = await tx`select id from commerce_refunds where order_id=${order.id}
      and status not in ('completed','failed','rejected') limit 1`;
    if (pending) throw Error("Resolve pending lesson refunds before financial recognition.");
  }
  const binding = financial.mode === "basis" ? financial.booking! : booking;
  const coachId = String(binding.coach_id || ""),
    productId = String(binding.product_id || "");
  let split: number | undefined;
  if (financial.mode === "basis") {
    const development = financial.compensation.development[0] as any;
    const coach = development?.coaches?.find((c: any) => c.id === coachId);
    const configured = financial.compensation.staffServices.find(
      (offer) =>
        offer.service_id === productId &&
        financial.compensation.staff.some(
          (staff) =>
            staff.id === offer.staff_id &&
            staff.active === true &&
            String(staff.email).toLowerCase() ===
              String(coach?.email || "")
                .trim()
                .toLowerCase(),
        ),
    );
    const approved =
      configured?.profit_split ??
      development?.coachPayouts?.find(
        (p: any) => p.coachId === coachId && p.serviceId === productId,
      )?.splitPct;
    if (approved !== undefined && approved !== null) split = Number(approved);
  } else {
    const [row] = await tx<{ payload: any }>`select payload from pd_working_file where id='club'`;
    const file = typeof row?.payload === "string" ? JSON.parse(row.payload) : row?.payload;
    const coach = file?.coaches?.find((c: any) => c.id === coachId);
    const [configured] = await tx<{
      profit_split: number;
    }>`select offers.profit_split from club_staff_services offers
      join club_staff staff on staff.id=offers.staff_id where lower(staff.email)=${coach?.email.trim().toLowerCase() || ""}
      and offers.service_id=${productId} and staff.active=true`;
    split =
      configured?.profit_split ??
      file?.coachPayouts?.find((p: any) => p.coachId === coachId && p.serviceId === productId)
        ?.splitPct;
  }
  if (split !== undefined && Number.isFinite(split) && split >= 0 && split <= 100) {
    const gross =
      order.snapshot.recurring || order.snapshot.kind === "package"
        ? Math.round(order.snapshot.regularCents / Math.max(1, order.snapshot.credits))
        : order.total_cents;
    await tx`insert into contractor_earnings(booking_id,coach_id,gross_cents,split_pct,amount_cents,status)
      values(${booking.id},${coachId},${gross},${split},${Math.round((gross * split) / 100)},'payable') on conflict(booking_id) do nothing`;
  }
  if (financial.mode === "basis") {
    const why = reason.trim();
    if (why.length < 5 || why.length > 1000) throw Error("Explain this financial recognition.");
    await tx`insert into financial_lesson_recognitions(booking_id,basis_id,basis_version,recognized_by,actor_kind,reason)
      values(${bookingId},'oklahoma-prospects',${financial.version},${userId},${context.principal.owner ? "owner" : "coach"},${why})`;
    await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state)
      values(${userId},${"lesson:" + bookingId},'recognize lesson',${why},${JSON.stringify({ bookingId, basisVersion: financial.version })}::jsonb)`;
    if (ownerCommand && operational) {
      await tx`update booking_records set status='completed',completed_at=coalesce(completed_at,now()),completed_by=coalesce(completed_by,${userId}) where id=${bookingId}`;
    }
    if (!ownerCommand)
      await tx`update finance_state set revision=revision+1 where id='organization'`;
  }
  return { recognized: true };
}
