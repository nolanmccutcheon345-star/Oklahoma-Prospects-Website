import { getSql } from "../db";
import { clubIdentity } from "../identity.server";
import { readWorkingFile } from "../pd/desk-impl.server";
import { assertPaymentRequest } from "./square-payments.server";
import { rateLimit } from "./checkout.server";
import {
  saveClubBookingCancellation,
  saveClubCancellationRefund,
  saveBookingReschedule,
} from "./booking-resolution.server";
import { executeSquareRefund } from "./square-management.server";
import { coachAvailable } from "./availability";
import { requireCoachService } from "./coach-services.server";
export async function staffCancellationContext(userId: string) {
  const me = await clubIdentity(userId),
    sql = await getSql();
  if (me.role !== "admin" && me.role !== "coach") throw new Error("Staff access required.");
  const file = await readWorkingFile();
  const coachId = file.coaches.find((c) => c.email.trim().toLowerCase() === me.email)?.id || null;
  return { me, sql, coachId };
}
export async function cancelClubSessionAction(
  userId: string,
  input: { id: string; initiator: "coach" | "facility" },
) {
  assertPaymentRequest();
  await rateLimit("club-cancellation", 30);
  const { me, sql, coachId } = await staffCancellationContext(userId);
  return saveClubBookingCancellation(sql, input.id, me, coachId, input.initiator);
}
export async function clubRefundAction(userId: string, id: string) {
  assertPaymentRequest();
  await rateLimit("club-refund", 15);
  const me = await clubIdentity(userId),
    sql = await getSql();
  const r = await saveClubCancellationRefund(sql, id, me);
  if (r.status !== "completed") await executeSquareRefund(r.id);
  const [saved] = await sql<{
    status: string;
  }>`select status from commerce_refunds where id=${r.id}`;
  if (saved.status === "completed")
    await sql`update club_requests set status='completed' where id=${"club-booking-cancellation:" + id} and status='refund_pending'`;
  return { status: saved.status, refundCents: r.amount_cents };
}
export async function rescheduleBookingAction(
  userId: string,
  input: { id: string; date: string; time: string; requestId: string },
) {
  assertPaymentRequest();
  await rateLimit("booking-reschedule", 30);
  const me = await clubIdentity(userId),
    sql = await getSql(),
    file = await readWorkingFile();
  return saveBookingReschedule(sql, input.id, me, input, async (b, date, time, minutes, tx) => {
    if (!b.coach_id) {
      const { checkCageBookingWindow } = await import("./booking-policy.server");
      await checkCageBookingWindow(me.billingHouseholdIds, date);
      return true;
    }
    await requireCoachService(tx, file.coaches, b.coach_id, b.product_id);
    return coachAvailable(file.availability, b.coach_id, date, time, minutes);
  });
}
