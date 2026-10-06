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
import { settleRefundBatch } from "./refund-funding.server";
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
  const { status } = await settleRefundBatch(sql, r.refunds, executeSquareRefund);
  if (status === "completed")
    await sql`update club_requests set status='completed' where id=${"club-booking-cancellation:" + id} and status='refund_pending'`;
  return { status, refundCents: r.amount_cents };
}
export async function rescheduleBookingAction(
  userId: string,
  input: { id: string; date: string; time: string; requestId: string },
) {
  assertPaymentRequest();
  await rateLimit("booking-reschedule", 30);
  const me = await clubIdentity(userId),
    sql = await getSql();
  const { currentMoveAvailability } = await import("./reschedule-fee.server");
  return saveBookingReschedule(sql, input.id, me, input, currentMoveAvailability);
}

export async function startRescheduleFeeAction(
  userId: string,
  input: { id: string; date: string; time: string; requestId: string },
) {
  assertPaymentRequest();
  await rateLimit("reschedule-fee", 15);
  const { squareConfig, squarePublicConfig } = await import("./square.server");
  const { assertSquareCheckoutScope } = await import("./square-config");
  const { prepareRescheduleFee } = await import("./reschedule-fee.server");
  const me = await clubIdentity(userId),
    sql = await getSql(),
    config = squareConfig();
  // Scope is enforced before creating a fee order, independently of browser controls.
  const [original] = await sql<{
    kind: string;
  }>`select o.kind from commerce_orders o join booking_records b on b.order_id=o.id where b.id=${input.id} and b.household_id=any(${me.billingHouseholdIds}::text[])`;
  if (!original) throw new Error("Booking not found.");
  assertSquareCheckoutScope(config, {
    kind: original.kind === "cage" ? "cage" : "lesson",
    recurring: false,
  });
  const fee = await prepareRescheduleFee(
    sql,
    input.id,
    { ...me, userId },
    input,
    config.environment,
  );
  const publicConfig = squarePublicConfig();
  if (!publicConfig) throw new Error("Payment configuration is unavailable.");
  return {
    orderId: fee.id,
    totalCents: fee.total_cents,
    expiresAt: new Date(fee.hold_until).toISOString(),
    date: fee.snapshot.rescheduleFee.date,
    time: fee.snapshot.rescheduleFee.time,
    config: publicConfig,
    name: me.name,
    email: me.email,
  };
}
export async function rescheduleFeeStatus(userId: string, orderId: string) {
  const me = await clubIdentity(userId),
    sql = await getSql();
  if (me.role === "player") throw new Error("Parent billing access required.");
  const [fee] = await sql<
    import("./reschedule-fee.server").FeeOrder
  >`select * from commerce_orders where id=${orderId} and kind='reschedule-fee' and user_id=${userId} and household_id=any(${me.billingHouseholdIds}::text[])`;
  if (!fee) throw new Error("Reschedule fee not found.");
  const [saved] =
    await sql`select id from club_requests where id=${"reschedule:" + fee.snapshot.rescheduleFee.requestId} and status='completed' and payload->>'feeOrderId'=${fee.id}`;
  return { status: fee.status, completed: fee.status === "paid" && Boolean(saved) };
}
