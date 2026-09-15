import { useEffect, useState } from "react";

const TZ = "America/Chicago";

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

function nextOpenLabel(weekday: string, open: boolean, mins: number) {
  if (open) {
    return `Open · until 8 PM`;
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
  const closeMins = 20 * 60;
  const open = mins >= openMins && mins < closeMins;

  return {
    open,
    label: open ? "Open now" : "Closed",
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

export function reservationSlots(isoDate: string) {
  if (!isoDate) return [];
  const local = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(local.getTime())) return [];
  const weekend = local.getDay() === 0 || local.getDay() === 6;
  const startHour = weekend ? 13 : 16;
  const slots: { value: string; label: string }[] = [];
  for (let hour = startHour; hour < 20; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 19 && minute === 30) continue;
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const suffix = hour >= 12 ? "PM" : "AM";
      const twelve = hour % 12 || 12;
      const label = `${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
      slots.push({ value, label });
    }
  }
  return slots;
}
