import type { Sql } from "../db";
import { CAGE_BOOKING_DAYS, chicagoDate, validDate } from "../scheduling";

/** Inclusive facility-local calendar days, not 14 * 24 hours of UTC time. */
export function withinBookingHorizon(date: string, days: number, now = new Date()) {
  if (!validDate(date) || !Number.isInteger(days) || days < 0) return false;
  const diff =
    (Date.parse(date + "T12:00:00Z") -
      Date.parse(chicagoDate(now) + "T12:00:00Z")) / 86_400_000;
  return Number.isInteger(diff) && diff >= 0 && diff <= days;
}

export function assertCageBookingHorizon(date: string, now = new Date()) {
  if (!withinBookingHorizon(date, CAGE_BOOKING_DAYS, now)) {
    throw new Error(`Cage bookings may be made today through ${CAGE_BOOKING_DAYS} days ahead.`);
  }
}

/**
 * All households, including All-Star members, have the same 14-day horizon.
 * Retain the original call signature for existing quote/checkout callers.
 * Historical commerce_policy priority values no longer affect new bookings.
 */
export async function checkCageBookingWindow(
  _householdIds: string[],
  date: string,
  _transaction?: Sql,
) {
  assertCageBookingHorizon(date);
}
