import type { Availability } from "./pd/types";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export function coachAvailabilityFields(rows: Availability[]) {
  return WEEKDAYS.flatMap((weekday) => {
    const matches = rows.filter(row => {
      const range = row.weekday.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*[-–—]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
      if (!range) return row.weekday.includes(weekday);
      const from = WEEKDAYS.indexOf(range[1] as typeof weekday), to = WEEKDAYS.indexOf(range[2] as typeof weekday), day = WEEKDAYS.indexOf(weekday);
      return from <= to ? day >= from && day <= to : day >= from || day <= to;
    });
    const windows = matches.map(row => {
      const match = row.window.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
      if (!match) throw new Error(`The saved ${weekday} availability could not be read. Contact the office before replacing it.`);
      function clock(hour: string, minute: string, meridian?: string) {
        const h = meridian ? Number(hour) % 12 + (meridian.toUpperCase() === "PM" ? 12 : 0) : Number(hour);
        return `${String(h).padStart(2, "0")}:${minute}`;
      }
      return { start: clock(match[1], match[2], match[3] || match[6]), end: clock(match[4], match[5], match[6]), available: true };
    });
    if (!windows.length) windows.push({ start: weekday === "Sat" || weekday === "Sun" ? "13:00" : "16:00", end: "20:00", available: false });
    return windows.map((window, index) => ({ ...window, weekday, id: `${weekday}-${index}`, label: index ? `${weekday} · window ${index + 1}` : weekday }));
  });
}

export function submittedCoachAvailability(form: FormData, fields: ReturnType<typeof coachAvailabilityFields>) {
  return fields.filter(field => form.get(field.id) === "on").map(field => ({
    weekday: field.weekday,
    start: String(form.get(`${field.id}-start`)),
    end: String(form.get(`${field.id}-end`)),
  }));
}
