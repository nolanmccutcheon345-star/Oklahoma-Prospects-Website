import { useEffect, useState } from "react";

const TZ = "America/Chicago";
const CLOSE_MINS = 20 * 60;

export type ClubStatus = {
  open: boolean;
  label: string;
  detail: string;
};

function zonedParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function chicagoDateISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function chicagoMinutes(now = new Date()) {
  const { hour, minute } = zonedParts(now);
  return hour * 60 + minute;
}

function nextOpenLabel(weekday: string, open: boolean, mins: number) {
  if (open) {
    return "Booking hours · until 8 PM";
  }
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const openMins = isWeekend ? 13 * 60 : 16 * 60;
  if (mins < openMins) {
    return isWeekend ? "Opens today at 1 PM" : "Opens today at 4 PM";
  }
  if (weekday === "Fri") return "Opens Saturday at 1 PM";
  if (weekday === "Sat") return "Opens Sunday at 1 PM";
  if (weekday === "Sun") return "Opens Monday at 4 PM";
  return "Opens tomorrow at 4 PM";
}

export function getClubStatus(now = new Date()): ClubStatus {
  const { weekday, hour, minute } = zonedParts(now);
  const mins = hour * 60 + minute;
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const openMins = isWeekend ? 13 * 60 : 16 * 60;
  const open = mins >= openMins && mins < CLOSE_MINS;

  return {
    open,
    label: open ? "Booking hours" : "Closed",
    detail: nextOpenLabel(weekday, open, mins),
  };
}

export function useClubStatus() {
  const [status, setStatus] = useState(() => getClubStatus());

  useEffect(() => {
    const tick = () => setStatus(getClubStatus());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return status;
}

function isChicagoWeekend(isoDate: string) {
  const probe = new Date(`${isoDate}T17:00:00.000Z`);
  if (Number.isNaN(probe.getTime())) return false;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
  }).format(probe);
  return weekday === "Sat" || weekday === "Sun";
}

export function minsFromHHMM(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + (m || 0);
}

export function rangesOverlap(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && b0 < a1;
}

export function reservationSlots(isoDate: string, minutes = 60, now = new Date()) {
  if (!isoDate) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return [];
  const weekend = isChicagoWeekend(isoDate);
  const startHour = weekend ? 13 : 16;
  const duration = Math.max(30, minutes);
  const today = chicagoDateISO(now);
  const nowMins = isoDate === today ? chicagoMinutes(now) : -1;
  const slots: { value: string; label: string }[] = [];
  for (let hour = startHour; hour < 20; hour += 1) {
    for (const minute of [0, 30]) {
      const start = hour * 60 + minute;
      if (start + duration > CLOSE_MINS) continue;
      if (start <= nowMins) continue;
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const suffix = hour >= 12 ? "PM" : "AM";
      const twelve = hour % 12 || 12;
      const label = `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
      slots.push({ value, label });
    }
  }
  return slots;
}
