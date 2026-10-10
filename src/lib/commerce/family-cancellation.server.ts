import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { consumeHouseholdChange, parentCancellationRefund } from "./booking-change-policy.server";
import { lessonRefundValue } from "./lesson-refund-value.server";
import {
  summarizeRefunds,
  standaloneRefundFunding,
  type RefundRecord,
} from "./refund-funding.server";

/** Identity comes from clubIdentity, never the request body. Provider execution follows
 * this committed, idempotent transaction so a retry cannot consume another allowance. */
export async function saveParentBookingCancellation(
  sql: Sql,
  bookingId: string,
  orderId: string,
  userId: string,
  identity: { role: string; billingHouseholdIds: string[] },
  now?: Date,
) {
  if (identity.role === "player")
    throw new Error("A parent account is required to manage bookings.");
  return sql.transaction(async (tx) => {
    // Consistent parent-order lock is shared with fulfillment and credit redemption.
    const [order] = await tx<{
      id: string;
      total_cents: number;
      square_payment_id: string | null;
      payment_provider: string;
      kind: string;
      status: string;
      square_fee_payment_id: string | null;
      snapshot: { recurring: boolean };
    }>`select * from commerce_orders where id=${orderId} for update`;
    if (!order) throw new Error("Booking order not found.");
    if(order.kind === "event") throw Error("Contact Front Office for camp or clinic changes under the event policy.");
    const key = "booking:" + bookingId;
    const existing =
      await tx<RefundRecord>`select id,amount_cents,status from commerce_refunds where request_key=${key} or request_key=${key + ":setup"} order by request_key`;
    const [booking] = await tx<{
      status: string;
      starts_at: Date;
      ends_at: Date;
      household_id: string | null;
      order_id: string;
    }>`select status,starts_at,ends_at,household_id,order_id from booking_records where id=${bookingId} for update`;
    if (
      !booking ||
      !booking.household_id ||
      booking.order_id !== orderId ||
      (identity.role !== "admin" && !identity.billingHouseholdIds.includes(booking.household_id))
    )
      throw new Error("Booking ownership changed. Refresh before cancelling.");
    if (existing.length) return summarizeRefunds(existing);
    if (order.status !== "paid")
      throw new Error("Successful payment is required before cancelling.");
    const confirmedAt = now || new Date();
    if (
      booking.status !== "confirmed" ||
      new Date(booking.starts_at).getTime() <= confirmedAt.getTime()
    )
      throw new Error("Only a future confirmed booking can be cancelled.");
    const uses = await tx<{
      id: string;
      grant_id: string;
      quantity: number;
      reversed_at: Date | null;
    }>`select * from credit_uses where booking_id=${bookingId} for update`;
    const isCredit = uses.length > 0;
    if (
      !isCredit &&
      (!order.square_payment_id ||
        !["lesson", "cage"].includes(order.kind) ||
        order.payment_provider !== "square" ||
        order.snapshot.recurring)
    )
      throw new Error("This booking requires office refund review.");
    const allowance = await consumeHouseholdChange(
      tx,
      booking.household_id,
      userId,
      "booking:" + bookingId,
      "cancellation",
      confirmedAt,
    );
    // Recompute after locking: preview quotes can cross a 48/24-hour or month boundary.
    let amount = isCredit
      ? 0
      : parentCancellationRefund(
          order.total_cents,
          new Date(booking.starts_at),
          allowance,
          confirmedAt,
        );
    let refundPaymentId = order.square_payment_id;
    const fraction =
      parentCancellationRefund(100, new Date(booking.starts_at), allowance, confirmedAt) / 100;
    if (isCredit && fraction === 0.5) {
      const value = await lessonRefundValue(tx, bookingId, orderId, booking.household_id, true);
      if (order.payment_provider !== "square" || value.halfRefundCents > value.availableCents)
        throw new Error("Lesson funding requires office review. No cancellation was applied.");
      amount = value.halfRefundCents;
      refundPaymentId = value.paymentId;
    }
    const funding =
      !isCredit && amount > 0
        ? await standaloneRefundFunding(tx, order, fraction, true)
        : [{ paymentId: refundPaymentId, amount, setup: false }];
    const restore = isCredit && fraction === 1;
    for (const u of uses) {
      if (u.reversed_at) continue;
      const restored = restore ? u.quantity : 0;
      if (restored)
        await tx`update credit_grants set remaining=least(quantity,remaining+${restored}) where id=${u.grant_id}`;
      await tx`update credit_uses set reversed_at=now(),restored_quantity=${restored} where id=${u.id}`;
    }
    await tx`update booking_records set status='cancelled' where id=${bookingId}`;
    await tx`delete from booking_occupancy where booking_id=${bookingId}`;
    const refunds: RefundRecord[] = [];
    for (const f of funding) {
      const [r] =
        await tx<RefundRecord>`insert into commerce_refunds(id,order_id,booking_id,user_id,amount_cents,status,reason,square_payment_id,request_key)
        values(${randomUUID()},${orderId},${bookingId},${userId},${f.amount},${f.amount ? "pending" : "completed"},${isCredit ? "Credit booking cancellation" : "Family booking cancellation"},${f.paymentId || null},${f.setup ? key + ":setup" : key}) returning id,amount_cents,status`;
      refunds.push(r);
    }
    return summarizeRefunds(refunds);
  });
}
