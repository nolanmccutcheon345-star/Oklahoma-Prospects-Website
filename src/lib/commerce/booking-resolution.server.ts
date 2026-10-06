import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import {
  consumeHouseholdChange,
  householdChangeAvailable,
  parentCancellationRefund,
} from "./booking-change-policy.server";
import { lessonRefundValue } from "./lesson-refund-value.server";
import { summarizeRefunds, standaloneRefundFunding } from "./refund-funding.server";
import { validateWindow } from "../scheduling";

type Identity = { role: string; billingHouseholdIds: string[]; userId: string };
type Booking = {
  id: string;
  order_id: string;
  household_id: string | null;
  coach_id: string | null;
  starts_at: Date;
  ends_at: Date;
  status: string;
  resources: string[];
  checked_in_at: Date | null;
  product_id: string;
  participant_count: number;
};
async function lockedBooking(tx: Sql, id: string) {
  const [ref] = await tx<{ order_id: string }>`select order_id from booking_records where id=${id}`;
  if (!ref) throw new Error("Booking not found.");
  const [order] = await tx<{
    id: string;
    status: string;
    total_cents: number;
    square_payment_id: string | null;
    payment_provider: string;
    square_fee_payment_id: string | null;
    kind: string;
    snapshot: { recurring: boolean };
  }>`select * from commerce_orders where id=${ref.order_id} for update`;
  const [booking] = await tx<Booking>`select * from booking_records where id=${id} for update`;
  if (!order || !booking || booking.order_id !== order.id)
    throw new Error("Booking ownership changed.");
  return { order, booking };
}
function familyAccess(b: Booking, me: Identity) {
  if (
    me.role === "player" ||
    !b.household_id ||
    (me.role !== "admin" && !me.billingHouseholdIds.includes(b.household_id))
  )
    throw new Error("A parent with billing access to this household is required.");
}
const clubKey = (id: string) => "club-booking-cancellation:" + id;
type Resolution = {
  id: string;
  status: string;
  payload: { initiator: "coach" | "facility"; choice?: "refund" | "reschedule" };
};

/** coachId is resolved from the authenticated staff identity, never client input. */
export async function saveClubBookingCancellation(
  sql: Sql,
  id: string,
  me: Identity,
  coachId: string | null,
  initiator: "coach" | "facility",
  now?: Date,
) {
  return sql.transaction(async (tx) => {
    const { booking: b } = await lockedBooking(tx, id);
    const currentTime = now || new Date();
    if (
      me.role !== "admin" &&
      (me.role !== "coach" || initiator !== "coach" || !coachId || b.coach_id !== coachId)
    )
      throw new Error("Only the assigned coach or an administrator can cancel this session.");
    const [existing] = await tx<Resolution>`select * from club_requests where id=${clubKey(id)}`;
    if (existing?.status === "pending") return { status: existing.status };
    if (
      !b.household_id ||
      b.status !== "confirmed" ||
      b.checked_in_at ||
      new Date(b.starts_at) <= currentTime
    )
      throw new Error("Choose a future confirmed household booking that has not checked in.");
    if (initiator === "coach" && b.participant_count > 1)
      throw new Error("Team and group cancellations follow a separate booking-credit rule.");
    if (initiator === "coach" && !b.coach_id)
      throw new Error("This booking has no assigned lesson coach.");
    await tx`insert into club_requests(id,user_id,kind,status,payload) values(${clubKey(id)},${me.userId},'club-booking-cancellation','pending',${JSON.stringify({ bookingId: id, initiator, choice: null, at: currentTime.toISOString() })}::jsonb) on conflict(id) do update set status='pending',payload=excluded.payload,user_id=excluded.user_id`;
    await tx`update booking_records set status='cancelled' where id=${id}`;
    await tx`delete from booking_occupancy where booking_id=${id}`;
    return { status: "pending" };
  });
}

export async function saveClubCancellationRefund(sql: Sql, id: string, me: Identity) {
  return sql.transaction(async (tx) => {
    const { booking: b, order } = await lockedBooking(tx, id);
    familyAccess(b, me);
    const [choice] =
      await tx<Resolution>`select * from club_requests where id=${clubKey(id)} for update`;
    if (!choice) throw new Error("No club cancellation choice is available.");
    const key = "club-refund:" + id;
    type Refund = { id: string; amount_cents: number; status: string };
    const existing =
      await tx<Refund>`select id,amount_cents,status from commerce_refunds where request_key=${key} or request_key=${key + ":setup"} order by request_key`;
    if (existing.length) return summarizeRefunds(existing);
    if (choice.status !== "pending" || b.status !== "cancelled" || order.status !== "paid")
      throw new Error("This cancellation choice has already been resolved.");
    const uses = await tx<{
      id: string;
    }>`select id from credit_uses where booking_id=${id} for update`;
    const funding: { paymentId: string; amount: number; key: string }[] = [];
    if (uses.length) {
      const value = await lessonRefundValue(tx, id, order.id, b.household_id!, true);
      if (value.paidCents > value.availableCents)
        throw new Error("Original lesson funding requires office review.");
      funding.push({ paymentId: value.paymentId, amount: value.paidCents, key });
    } else {
      for (const f of await standaloneRefundFunding(tx, order, 1, true))
        funding.push({
          paymentId: f.paymentId,
          amount: f.amount,
          key: f.setup ? key + ":setup" : key,
        });
    }
    if (order.payment_provider !== "square" || funding.some((f) => f.amount <= 0))
      throw new Error("Original payment requires office review.");
    const refunds: Refund[] = [];
    for (const f of funding) {
      const [r] =
        await tx<Refund>`insert into commerce_refunds(id,order_id,booking_id,user_id,amount_cents,status,reason,square_payment_id,request_key)
        values(${randomUUID()},${order.id},${id},${me.userId},${f.amount},'pending',${choice.payload.initiator === "facility" ? "Facility closure refund" : "Coach initiated cancellation"},${f.paymentId},${f.key}) returning id,amount_cents,status`;
      refunds.push(r);
    }
    await tx`update credit_uses set reversed_at=now(),restored_quantity=0 where booking_id=${id} and reversed_at is null`;
    await tx`update club_requests set status='refund_pending',payload=payload || '{"choice":"refund"}'::jsonb where id=${choice.id}`;
    return summarizeRefunds(refunds);
  });
}

/** Read-only fee preview. Payment confirmation must revalidate this quote; it is not an authorization to charge. */
export async function bookingRescheduleQuote(sql: Sql, id: string, me: Identity, now?: Date) {
  return sql.transaction(async (tx) => {
    const { booking: b, order } = await lockedBooking(tx, id);
    familyAccess(b, me);
    const at = now || new Date();
    const [club] = await tx<Resolution>`select * from club_requests where id=${clubKey(id)}`;
    const exempt = club?.status === "pending" && b.status === "cancelled";
    if (!exempt && (b.status !== "confirmed" || new Date(b.starts_at) <= at || b.checked_in_at))
      throw new Error("Choose a future confirmed booking that has not checked in.");
    if (order.status !== "paid")
      throw new Error("Successful payment is required before rescheduling.");
    if (
      !exempt &&
      !(await householdChangeAvailable(tx, b.household_id!, "reschedule-quote:" + id, at))
    )
      throw new Error(
        "Your household has already used this month's change allowance. Cancellation remains possible without a refund.",
      );
    const fraction = parentCancellationRefund(100, new Date(b.starts_at), true, at) / 100;
    const common = {
      bookingId: id,
      quotedAt: at.toISOString(),
      currency: "USD" as const,
      householdExempt: exempt,
    };
    if (exempt || fraction === 1)
      return { ...common, mode: "free" as const, feeCents: 0, sessionPaidCents: null };
    // The owner specifies no refund under 24h, but has not approved a new 100% reschedule charge.
    if (fraction === 0)
      return { ...common, mode: "unavailable" as const, feeCents: null, sessionPaidCents: null };
    const uses = await tx`select id from credit_uses where booking_id=${id}`;
    let sessionPaidCents: number, feeCents: number;
    if (uses.length) {
      const value = await lessonRefundValue(tx, id, order.id, b.household_id!);
      sessionPaidCents = value.paidCents;
      feeCents = value.halfRefundCents;
    } else {
      const original = await standaloneRefundFunding(tx, order, 1);
      sessionPaidCents = original.filter((f) => !f.setup).reduce((sum, f) => sum + f.amount, 0);
      feeCents = Math.round(sessionPaidCents / 2);
    }
    if (sessionPaidCents <= 0) throw new Error("Original session funding requires office review.");
    return { ...common, mode: "payment_required" as const, feeCents, sessionPaidCents };
  });
}

export async function saveBookingReschedule(
  sql: Sql,
  id: string,
  me: Identity,
  input: { date: string; time: string; requestId: string },
  available: (b: Booking, date: string, time: string, minutes: number, tx: Sql) => Promise<boolean>,
  now?: Date,
) {
  return sql.transaction(async (tx) => {
    const { booking: b, order } = await lockedBooking(tx, id);
    const currentTime = now || new Date();
    familyAccess(b, me);
    const key = "reschedule:" + input.requestId;
    const [previous] = await tx<{
      payload: { bookingId: string };
    }>`select payload from club_requests where id=${key} and user_id=${me.userId}`;
    if (previous) {
      if (previous.payload.bookingId !== id)
        throw new Error("This request was used for another booking.");
      return { status: "completed" };
    }
    const [club] =
      await tx<Resolution>`select * from club_requests where id=${clubKey(id)} for update`;
    const clubChange = club?.status === "pending" && b.status === "cancelled";
    if (
      !clubChange &&
      (b.status !== "confirmed" || new Date(b.starts_at) <= currentTime || b.checked_in_at)
    )
      throw new Error("Choose a future confirmed booking that has not checked in.");
    if (order.status !== "paid")
      throw new Error("Successful payment is required before rescheduling.");
    if (
      !clubChange &&
      parentCancellationRefund(100, new Date(b.starts_at), true, currentTime) !== 100
    )
      throw new Error(
        "Online free rescheduling requires at least 48 hours' notice. Later changes require fee collection.",
      );
    if (!b.resources.length) throw new Error("Booking resource mapping requires office review.");
    const minutes = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000;
    const window = validateWindow(input.date, input.time, minutes, currentTime);
    if (window.start.getTime() === new Date(b.starts_at).getTime())
      throw new Error("Choose a different session time.");
    if (!(await available(b, input.date, input.time, minutes, tx)))
      throw new Error("This coach or booking resource is unavailable for that time.");
    const credits = await tx<{
      expires_at: Date;
      starts_at: Date;
    }>`select g.expires_at,g.starts_at from credit_grants g join credit_uses u on u.grant_id=g.id where u.booking_id=${id} and u.reversed_at is null`;
    if (
      credits.some(
        (g) => window.end > new Date(g.expires_at) || window.start < new Date(g.starts_at),
      )
    )
      throw new Error("Choose a time within the original credit period.");
    if (
      !clubChange &&
      !(await consumeHouseholdChange(
        tx,
        b.household_id!,
        me.userId,
        key,
        "reschedule",
        currentTime,
      ))
    )
      throw new Error("Your household has already used this month's change allowance.");
    await tx`delete from booking_occupancy where booking_id=${id}`;
    for (const resource of [...new Set(b.resources)].sort())
      for (let ms = +window.start; ms < +window.end; ms += 300000) {
        const inserted =
          await tx`insert into booking_occupancy(resource_id,slot_at,booking_id) values(${resource},${new Date(ms).toISOString()},${id}) on conflict do nothing returning booking_id`;
        if (!inserted.length)
          throw new Error(
            "That time was just booked. Your original booking and allowance are unchanged.",
          );
      }
    await tx`update booking_records set status='confirmed',starts_at=${window.start.toISOString()},ends_at=${window.end.toISOString()} where id=${id}`;
    await tx`insert into club_requests(id,user_id,kind,payload,status) values(${key},${me.userId},'booking-reschedule',${JSON.stringify({ bookingId: id, initiator: clubChange ? club!.payload.initiator : "parent", oldStart: new Date(b.starts_at).toISOString(), newStart: window.start.toISOString() })}::jsonb,'completed')`;
    if (clubChange)
      await tx`update club_requests set status='completed',payload=payload || '{"choice":"reschedule"}'::jsonb where id=${club!.id}`;
    return { status: "completed" };
  });
}
