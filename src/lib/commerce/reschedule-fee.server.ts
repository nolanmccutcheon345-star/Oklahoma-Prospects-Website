import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { Quote } from "./contracts";
import { validateWindow } from "../scheduling";
import { householdChangeMonth } from "./booking-change-policy.server";
import {
  lockedBooking,
  familyAccess,
  bookingRescheduleQuoteInTransaction,
  applyBookingReschedule,
  type Booking,
  type Identity,
} from "./booking-resolution.server";
import { queueExpiredCheckoutRefunds } from "./store.server";

type Move = {
  bookingId: string;
  requestId: string;
  date: string;
  time: string;
  oldStart: string;
  month: string;
};
export type FeeOrder = {
  id: string;
  kind: string;
  user_id: string;
  email: string;
  household_id: string;
  status: string;
  total_cents: number;
  payment_environment: string;
  hold_until: Date;
  square_payment_id: string | null;
  snapshot: Quote & { rescheduleFee: Move };
};
export type MoveAvailability = (
  b: Booking,
  date: string,
  time: string,
  minutes: number,
  tx: Sql,
) => Promise<boolean>;
export const currentMoveAvailability: MoveAvailability = async (b, date, time, minutes, tx) => {
  if (!b.coach_id) {
    const { checkCageBookingWindow } = await import("./booking-policy.server");
    await checkCageBookingWindow([b.household_id!], date, tx);
    return true;
  }
  const { readWorkingFile } = await import("../pd/desk-impl.server");
  const { requireCoachService } = await import("./coach-services.server");
  const { coachAvailable } = await import("./availability");
  const file = await readWorkingFile(tx);
  await requireCoachService(tx, file.coaches, b.coach_id, b.product_id);
  return coachAvailable(file.availability, b.coach_id, date, time, minutes);
};

/** Recover an unfinished fee after reload without reading card tokens or making a payment. */
export async function unfinishedRescheduleFee(
  sql: Sql,
  id: string,
  me: Identity,
  now = new Date(),
) {
  const [booking] = await sql<Booking>`select * from booking_records where id=${id}`;
  if (!booking) throw new Error("Booking not found.");
  familyAccess(booking, me);
  const [fee] = await sql<FeeOrder & { uncertain: boolean }>`select o.*,
    exists(select 1 from square_payment_attempts a where a.order_id=o.id and a.status in ('pending','unknown')) as uncertain
    from commerce_orders o where o.kind='reschedule-fee' and o.user_id=${me.userId}
    and o.household_id=${booking.household_id} and o.snapshot->'rescheduleFee'->>'bookingId'=${id}
    and (o.status in ('pending','payment_review') or exists(select 1 from square_payment_attempts a where a.order_id=o.id and a.status in ('pending','unknown')))
    order by o.created_at desc limit 1`;
  if (!fee) return null;
  return {
    fee,
    canPay: fee.status === "pending" && !fee.uncertain && +new Date(fee.hold_until) > +now,
  };
}

/** No payment, new booking, credit or allowance is created here. */
export async function prepareRescheduleFee(
  sql: Sql,
  id: string,
  me: Identity & { email: string },
  input: { date: string; time: string; requestId: string },
  environment: string,
  available = currentMoveAvailability,
  now?: Date,
) {
  return sql.transaction(async (tx) => {
    const at = now || new Date();
    const { booking: b, order: original } = await lockedBooking(tx, id);
    familyAccess(b, me);
    const key = "reschedule-fee:" + input.requestId;
    const [retry] = await tx<FeeOrder>`select * from commerce_orders where request_key=${key}`;
    if (retry) {
      const m = retry.snapshot.rescheduleFee;
      if (
        retry.user_id !== me.userId ||
        m.bookingId !== id ||
        m.date !== input.date ||
        m.time !== input.time ||
        retry.payment_environment !== environment
      )
        throw new Error("This reschedule request belongs to another payment or time.");
      return retry;
    }
    const quote = await bookingRescheduleQuoteInTransaction(tx, id, me, at);
    if (
      quote.mode !== "payment_required" ||
      !Number.isSafeInteger(quote.feeCents) ||
      quote.feeCents <= 0
    )
      throw new Error("This booking does not require an eligible 24–48-hour change fee.");
    const [pending] =
      await tx`select id from commerce_orders where kind='reschedule-fee' and snapshot->'rescheduleFee'->>'bookingId'=${id} and (status in ('pending','payment_review') or exists(select 1 from square_payment_attempts a where a.order_id=commerce_orders.id and a.status in ('pending','unknown'))) limit 1`;
    if (pending)
      throw new Error(
        "A change-fee payment already exists. Check its status before starting another.",
      );
    const minutes = (+new Date(b.ends_at) - +new Date(b.starts_at)) / 60000;
    const window = validateWindow(input.date, input.time, minutes, at);
    if (
      +window.start === +new Date(b.starts_at) ||
      !b.resources.length ||
      !(await available(b, input.date, input.time, minutes, tx))
    )
      throw new Error("Choose a different available session time.");
    const occupied =
      await tx`select booking_id from booking_occupancy where resource_id=any(${b.resources}::text[]) and slot_at>=${window.start.toISOString()} and slot_at<${window.end.toISOString()} and booking_id<>${id} limit 1`;
    if (occupied.length) throw new Error("That time is already booked. No fee was submitted.");
    const [outsideCredit] =
      await tx`select g.id from credit_grants g join credit_uses u on u.grant_id=g.id where u.booking_id=${id} and u.reversed_at is null and (g.starts_at>${window.start.toISOString()} or g.expires_at<${window.end.toISOString()}) limit 1`;
    if (outsideCredit) throw new Error("Choose a time within the original credit period.");
    const hold = new Date(Math.min(+at + 10 * 60000, +new Date(b.starts_at) - 24 * 3600000));
    if (+hold <= +at) throw new Error("The 24-hour change-fee window has ended.");
    const snapshot: FeeOrder["snapshot"] = {
      productId: b.product_id,
      kind: original.kind === "cage" ? "cage" : "lesson",
      title: "Session reschedule fee",
      totalCents: quote.feeCents,
      regularCents: quote.feeCents,
      setupCents: 0,
      recurring: false,
      assessment: false,
      duration: 0,
      sessionMinutes: 0,
      credits: 0,
      remote: 0,
      expiresDays: 1,
      discipline: "",
      resources: [],
      lines: [{ label: "50% individual-session reschedule fee", cents: quote.feeCents }],
      teamRate: false,
      needsSlot: false,
      rescheduleFee: {
        bookingId: id,
        requestId: input.requestId,
        date: input.date,
        time: input.time,
        oldStart: new Date(b.starts_at).toISOString(),
        month: householdChangeMonth(at),
      },
    };
    const [fee] =
      await tx<FeeOrder>`insert into commerce_orders(id,request_key,user_id,email,product_id,kind,snapshot,total_cents,status,payment_provider,payment_environment,household_id,hold_until)
      values(${randomUUID()},${key},${me.userId},${me.email},${b.product_id},'reschedule-fee',${JSON.stringify(snapshot)}::jsonb,${quote.feeCents},'pending','square',${environment},${b.household_id},${hold.toISOString()}) returning *`;
    return fee;
  });
}

/** Called before charging and again after authoritative provider confirmation. */
export async function validatePreparedRescheduleFee(
  tx: Sql,
  orderId: string,
  me: Identity,
  at = new Date(),
  paid = false,
) {
  const [fee] = await tx<FeeOrder>`select * from commerce_orders where id=${orderId}`;
  const m = fee?.snapshot.rescheduleFee;
  if (
    !fee ||
    fee.kind !== "reschedule-fee" ||
    !m ||
    fee.user_id !== me.userId ||
    ![paid ? "paid" : "pending"].includes(fee.status) ||
    +new Date(fee.hold_until) <= +at ||
    m.month !== householdChangeMonth(at)
  )
    throw new Error("This reschedule fee expired or no longer applies.");
  const { booking: b } = await lockedBooking(tx, m.bookingId);
  familyAccess(b, me);
  const quote = await bookingRescheduleQuoteInTransaction(tx, b.id, me, at);
  if (
    b.household_id !== fee.household_id ||
    new Date(b.starts_at).toISOString() !== m.oldStart ||
    quote.mode !== "payment_required" ||
    quote.feeCents !== fee.total_cents
  )
    throw new Error("The original session or reschedule fee changed.");
  if (paid) {
    const [payment] =
      await tx`select id from square_payments where id=${fee.square_payment_id} and order_id=${fee.id} and environment=${fee.payment_environment} and status='COMPLETED' and purpose='reschedule-fee' and amount_cents=${fee.total_cents} and refunded_cents=0`;
    if (!payment) throw new Error("Verified change-fee payment is required.");
  }
  return fee;
}

/** Caller has already verified and persisted this completed Square payment in its transaction. */
export async function completePaidReschedule(
  tx: Sql,
  fee: FeeOrder,
  available = currentMoveAvailability,
  now?: Date,
) {
  const at = now || new Date();
  await tx`savepoint paid_reschedule_move`;
  try {
    const m = fee.snapshot.rescheduleFee;
    if (!m) throw new Error("Missing reschedule payment details.");
    await tx`update commerce_orders set status='paid',updated_at=now() where id=${fee.id}`;
    await applyBookingReschedule(
      tx,
      m.bookingId,
      { role: "parent", userId: fee.user_id, billingHouseholdIds: [fee.household_id] },
      m,
      available,
      at,
      fee.id,
    );
    await tx`release savepoint paid_reschedule_move`;
    return { status: "paid" };
  } catch {
    await tx`rollback to savepoint paid_reschedule_move`;
    await tx`release savepoint paid_reschedule_move`;
    await tx`update commerce_orders set status='payment_review',updated_at=now() where id=${fee.id}`;
    await queueExpiredCheckoutRefunds(tx, fee.payment_environment, fee.id);
    await tx`insert into club_requests(id,user_id,kind,payload,status) values(${"reschedule-review:" + fee.id},${fee.user_id},'payment-review',${JSON.stringify({ orderId: fee.id, reason: "Paid reschedule could not be applied. Original booking kept; fee queued for refund." })}::jsonb,'pending') on conflict do nothing`;
    return { status: "payment_review" };
  }
}
