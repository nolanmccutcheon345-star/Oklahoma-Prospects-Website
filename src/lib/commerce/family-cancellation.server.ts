import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { consumeHouseholdChange, parentCancellationRefund } from "./booking-change-policy.server";

/** Identity comes from clubIdentity, never the request body. Provider execution follows
 * this committed, idempotent transaction so a retry cannot consume another allowance. */
export async function saveParentBookingCancellation(
  sql: Sql, bookingId: string, orderId: string, userId: string,
  identity: { role: string; billingHouseholdIds: string[] }, now = new Date(),
) {
  if (identity.role === "player") throw new Error("A parent account is required to manage bookings.");
  return sql.transaction(async tx => {
    // Consistent parent-order lock is shared with fulfillment and credit redemption.
    const [order] = await tx<{
      id: string; total_cents: number; square_payment_id: string | null;
      payment_provider: string; snapshot: { recurring: boolean };
    }>`select * from commerce_orders where id=${orderId} for update`;
    if (!order) throw new Error("Booking order not found.");
    const [existing] = await tx<{
      id: string;
      amount_cents: number;
      status: string;
      square_refund_id: string | null;
    }>`select * from commerce_refunds where request_key=${"booking:" + bookingId}`;
    const [booking] = await tx<{
      status: string;
      starts_at: Date;
      ends_at: Date;
      household_id: string | null;
      order_id: string;
    }>`select status,starts_at,ends_at,household_id,order_id from booking_records where id=${bookingId} for update`;
    if (!booking || !booking.household_id || booking.order_id !== orderId ||
        (identity.role !== "admin" && !identity.billingHouseholdIds.includes(booking.household_id)))
      throw new Error("Booking ownership changed. Refresh before cancelling.");
    if (existing) return existing;
    if (booking.status !== "confirmed" || new Date(booking.starts_at).getTime() <= now.getTime())
      throw new Error("Only a future confirmed booking can be cancelled.");
    const uses = await tx<{
      id: string;
      grant_id: string;
      quantity: number;
      reversed_at: Date | null;
    }>`select * from credit_uses where booking_id=${bookingId} for update`;
    const isCredit = uses.length > 0;
    if (!isCredit && (!order.square_payment_id || order.payment_provider !== "square" || order.snapshot.recurring))
      throw new Error("This booking requires office refund review.");
    const allowance = await consumeHouseholdChange(tx, booking.household_id, userId,
      "booking:" + bookingId, "cancellation", now);
    // Recompute after locking: preview quotes can cross a 48/24-hour or month boundary.
    const amount = isCredit ? 0 : parentCancellationRefund(order.total_cents, new Date(booking.starts_at), allowance, now);
    const fraction = parentCancellationRefund(100, new Date(booking.starts_at), allowance, now) / 100;
    if (isCredit && fraction === 0.5)
      throw new Error("Half-credit policy requires office review. No cancellation was applied.");
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
    const [r] = await tx<{
      id: string;
      amount_cents: number;
      status: string;
      square_refund_id: string | null;
    }>`insert into commerce_refunds(id,order_id,booking_id,user_id,amount_cents,status,reason,square_payment_id,request_key)
      values(${randomUUID()},${orderId},${bookingId},${userId},${amount},${amount ? "pending" : "completed"},${isCredit ? "Credit booking cancellation" : "Family booking cancellation"},${order.square_payment_id || null},${"booking:" + bookingId}) returning *`;
    return r;
  });
}
