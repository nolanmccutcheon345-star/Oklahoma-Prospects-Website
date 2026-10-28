import { chicagoDate, chicagoInstant, slotsFor, validDate } from "../scheduling";
import { coachAvailable } from "./availability";
import type { Availability } from "../pd/types";

export const NEXT_LESSON_DAYS = 28;
export function calendarDay(date: string, offset: number) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

/** The caller supplies only occupancy for this booking's coach, player and spaces. */
export function availableLessonTimes({ date, duration, coachId, availability, occupied, now = new Date() }: {
  date: string; duration: number; coachId: string; availability: Availability[];
  occupied: { slot_at: Date | string }[]; now?: Date;
}) {
  const slotsOn = (day: string) => slotsFor(day, duration, now).filter(slot => {
    if (!coachAvailable(availability, coachId, day, slot.value, duration)) return false;
    const start = chicagoInstant(day, slot.value).getTime(), end = start + duration * 60_000;
    return !occupied.some(row => {
      const at = new Date(row.slot_at).getTime();
      return at >= start && at < end;
    });
  });
  if (!validDate(date)) return { slots: [], nextAvailable: null };
  const slots = slotsOn(date);
  if (slots.length) return { slots, nextAvailable: null };
  const first = date < chicagoDate(now) ? chicagoDate(now) : calendarDay(date, 1);
  for (let offset = 0; offset < NEXT_LESSON_DAYS; offset++) {
    const nextDate = calendarDay(first, offset), nextSlots = slotsOn(nextDate);
    if (nextSlots.length) return { slots, nextAvailable: { date: nextDate, slots: nextSlots } };
  }
  return { slots, nextAvailable: null };
}
