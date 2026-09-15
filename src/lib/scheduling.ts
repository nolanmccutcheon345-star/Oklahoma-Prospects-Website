export const CLUB_TIME_ZONE = "America/Chicago";
export function chicagoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}
export function timeMinutes(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Choose a valid time.");
  const [h, m] = time.split(":").map(Number); return h * 60 + m;
}
/** Resolve Chicago wall time with the offset on that date, including DST. */
export function chicagoInstant(date: string, time: string) {
  if (!validDate(date)) throw new Error("Choose a valid date.");
  timeMinutes(time);
  const wall = Date.parse(`${date}T${time}:00Z`);
  let guess = wall + 6 * 3_600_000;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: CLUB_TIME_ZONE, timeZoneName: "longOffset" }).formatToParts(new Date(guess));
    const offset = parts.find(p => p.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!offset) throw new Error("Could not resolve club time.");
    const mins = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === "+" ? 1 : -1);
    guess = wall - mins * 60_000;
  }
  return new Date(guess);
}
export function openingMinutes(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6 ? 13 * 60 : 16 * 60;
}
export function slotsFor(date: string, duration: number, now = new Date()) {
  if (!validDate(date) || date < chicagoDate(now) || !Number.isSafeInteger(duration) || duration < 20 || duration > 180) return [];
  const slots: { value: string; label: string }[] = [];
  for (let start = openingMinutes(date); start + duration <= 20 * 60; start += 30) {
    const h = Math.floor(start / 60), m = start % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (chicagoInstant(date, value) <= now) continue;
    slots.push({ value, label: `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}` });
  }
  return slots;
}
export function validateWindow(date: string, time: string, duration: number, now = new Date()) {
  if (!slotsFor(date, duration, now).some(s => s.value === time)) throw new Error("That start time is no longer available or finishes after closing.");
  const start = chicagoInstant(date, time);
  return { start, end: new Date(start.getTime() + duration * 60_000) };
}
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}
