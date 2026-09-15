import { chicagoInstant } from "../scheduling";
import {
  NOW,
  openSlots,
  scheduleSessionsForPlan,
  upcomingDates,
} from "./core-algorithms.js";
import {
  WEEKDAYS,
  earningAmount,
  lessonServiceForPlan,
} from "./content/commerce";
import type { Booking, DevelopmentData, Policy, WaitlistEntry } from "./types";

export type ProposedSession = {
  coachId: string;
  date: string;
  dateLabel: string;
  time: string;
};

export type CancelQuote = {
  feePct: number;
  fee: number;
  label: string;
  hours: number;
};

export function proposeFromAvailability(
  data: DevelopmentData,
  coachId: string,
  sessionsNeeded: number,
  remoteNeeded = 0,
): { booked: ProposedSession[]; remoteReviews: { dueDate: string }[]; short: boolean } {
  return scheduleSessionsForPlan(data, coachId, sessionsNeeded, remoteNeeded);
}

export function slotsOn(data: DevelopmentData, coachId: string, date: string, extra: ProposedSession[] = []) {
  return openSlots(data.availability, [...data.bookings, ...extra], coachId, { iso: date });
}

export function proposeRecurring(
  data: DevelopmentData,
  coachId: string,
  weekday: number,
  time: string,
  weeks: number,
  extra: ProposedSession[] = [],
): { booked: ProposedSession[]; short: boolean } {
  const dates = upcomingDates(98) as { iso: string; label: string }[];
  const booked: ProposedSession[] = [];
  const taken = [...extra];
  for (const d of dates) {
    if (booked.length >= weeks) break;
    const utc = new Date(`${d.iso}T12:00:00Z`);
    if (utc.getUTCDay() !== weekday) continue;
    const open = openSlots(data.availability, [...data.bookings, ...taken], coachId, d) as string[];
    if (!open.includes(time)) continue;
    const row = { coachId, date: d.iso, dateLabel: d.label, time };
    booked.push(row);
    taken.push(row);
  }
  return { booked, short: booked.length < weeks };
}

export function cancelQuote(booking: Booking, policy: Policy, now = NOW()): CancelQuote {
  const time = booking.time || "17:00";
  const session = chicagoInstant(booking.date, time);
  const hours = (session.getTime() - now.getTime()) / 36e5;
  const fullRefundAfter = policy.freeCancelHours;
  const noRefundInside = policy.partialRefundHours ?? 24;
  if (hours < 0) {
    return {
      feePct: policy.noShowFeePct,
      fee: Math.round(booking.price * policy.noShowFeePct) / 100,
      label: "No-show — no refund",
      hours,
    };
  }
  if (hours < noRefundInside) {
    return {
      feePct: policy.noShowFeePct,
      fee: Math.round(booking.price * policy.noShowFeePct) / 100,
      label: `Inside ${noRefundInside} hours — no refund`,
      hours,
    };
  }
  if (hours < fullRefundAfter) {
    return {
      feePct: policy.lateCancelFeePct,
      fee: Math.round(booking.price * policy.lateCancelFeePct) / 100,
      label: `${noRefundInside}–${fullRefundAfter} hours — ${policy.lateCancelFeePct}% refund`,
      hours,
    };
  }
  return { feePct: 0, fee: 0, label: "Full refund", hours };
}

export function earningStatus(booking: Booking): "pending" | "payable" | "paid" {
  if (booking.status === "cancelled") return "pending";
  if (booking.payout === "paid") return "paid";
  if (booking.status === "completed") return "payable";
  return "pending";
}

export function earningRow(booking: Booking) {
  return {
    bookingId: booking.id,
    coachId: booking.coachId ?? "c-steve",
    amount: earningAmount(booking.price, booking.serviceId),
    status: earningStatus(booking),
  };
}

export function nextMatchingSlot(
  data: DevelopmentData,
  coachId: string,
  preferredDay: string,
  preferredTime: string,
): ProposedSession | null {
  const want = WEEKDAYS.indexOf(preferredDay as (typeof WEEKDAYS)[number]);
  const dates = upcomingDates(42) as { iso: string; label: string }[];
  for (const d of dates) {
    const utc = new Date(`${d.iso}T12:00:00Z`);
    if (want >= 0 && utc.getUTCDay() !== want) continue;
    const open = openSlots(data.availability, data.bookings, coachId, d) as string[];
    if (open.includes(preferredTime)) {
      return { coachId, date: d.iso, dateLabel: d.label, time: preferredTime };
    }
  }
  return null;
}

export function waitlistOpen(rows: WaitlistEntry[]) {
  return rows.filter((row) => (row.status ?? "open") === "open");
}

export function planSessionCount(kind: string, item: { credits?: number; lessons?: number; minutes?: number }) {
  if (kind === "package") return item.credits ?? 4;
  if (kind === "membership") return item.lessons ?? 0;
  return 1;
}

export function serviceIdForCheckout(kind: string, id: string, minutes: number) {
  if (kind === "lesson") return id;
  return lessonServiceForPlan(minutes);
}

export { scheduleSessionsForPlan, openSlots, upcomingDates };
