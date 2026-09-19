/** Approved two-week trial. Dates/times are facility-local (America/Chicago). */
export const AFTER_SCHOOL = {
  id: "after-school-2026-09",
  start: "2026-09-21",
  end: "2026-10-02",
  dates: "September 21–October 2, 2026",
} as const;

export function afterSchoolCents(input: {
  date?: string;
  time?: string;
  duration?: number;
  schoolAge?: boolean;
  household: boolean;
  athleteCount: number;
  laneCount: number;
  field: boolean;
}): number | null {
  if (
    !input.schoolAge ||
    !input.household ||
    input.athleteCount < 1 ||
    input.athleteCount > 2 ||
    input.laneCount < 1 ||
    input.laneCount >= 3 ||
    input.field
  )
    return null;
  if (
    !input.date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    input.date < AFTER_SCHOOL.start ||
    input.date > AFTER_SCHOOL.end
  )
    return null;
  const day = new Date(`${input.date}T12:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return null;
  if (!input.time || !/^\d{2}:\d{2}$/.test(input.time)) return null;
  const [hour, minute] = input.time.split(":").map(Number);
  const start = hour * 60 + minute;
  if (minute >= 60 || start < 16 * 60 || start + (input.duration ?? 0) > 18 * 60) return null;
  return input.duration === 30 ? 2000 : input.duration === 60 ? 3500 : null;
}
