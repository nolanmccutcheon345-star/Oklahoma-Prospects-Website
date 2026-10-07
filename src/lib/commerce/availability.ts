import { timeMinutes, openingMinutes, validDate } from "../scheduling";
import type { Availability } from "../pd/types";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Does this recurring schedule offer any valid half-hour booking window? */
export function coachHasBookingWindow(rows: Availability[], coachId: string, duration = 30) {
  if (!Number.isSafeInteger(duration) || duration < 20 || duration > 180) return false;
  // A representative week checks recurring weekday rules; it does not create appointments.
  for (let day = 0; day < 7; day++) {
    const date = new Date(Date.UTC(2000, 0, 2 + day)).toISOString().slice(0, 10);
    for (let start = openingMinutes(date); start + duration <= 20 * 60; start += 30) {
      const time = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
      if (coachAvailable(rows, coachId, date, time, duration)) return true;
    }
  }
  return false;
}
export function coachAvailable(rows: Availability[], coachId: string, date: string, time: string, duration: number) {
  if (!validDate(date)) return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const start = timeMinutes(time);
  return rows.some(row => {
    if (row.coachId !== coachId) return false;
    const weekday = row.weekday.replaceAll("–", "-").replaceAll("—", "-");
    const range = weekday.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*-\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
    const from = range ? DAYS.indexOf(range[1]) : -1, to = range ? DAYS.indexOf(range[2]) : -1;
    const matchesDay = range ? (from <= to ? day >= from && day <= to : day >= from || day <= to) : weekday.includes(DAYS[day]);
    if (!matchesDay) return false;
    const match = row.window.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return false;
    const minute = (h: string, m: string, meridian?: string) => {
      let hour = Number(h);
      if (meridian) hour = hour % 12 + (meridian.toUpperCase() === "PM" ? 12 : 0);
      return hour * 60 + Number(m);
    };
    const a = Math.max(openingMinutes(date), minute(match[1], match[2], match[3] || match[6]));
    const b = Math.min(20 * 60, minute(match[4], match[5], match[6]));
    return start >= a && start + duration <= b;
  });
}
