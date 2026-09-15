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

export { timeMinutes as minsFromHHMM, overlaps as rangesOverlap, slotsFor as reservationSlots } from "./scheduling";
