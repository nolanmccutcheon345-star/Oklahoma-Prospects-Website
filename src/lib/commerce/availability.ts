import { timeMinutes, openingMinutes, validDate } from "../scheduling";
import type { Availability } from "../pd/types";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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
