// @ts-nocheck
/* Prospects Team Management OS — helpers. Club day is pinned so seed stays still. */

export const TODAY = new Date(2026, 8, 15);

export const C = {
  cream: "#f2eec1",
  navy: "#071b31",
  maroon: "#681c35",
  columbia: "#6ca6e6",
  pink: "#f4b6cf",
};

let seq = 0;

export function uid() {
  seq += 1;
  return `okp-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function d(value) {
  if (value instanceof Date) return new Date(value.getTime());
  const s = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? new Date(TODAY.getTime()) : parsed;
}

export function iso(value) {
  const x = value instanceof Date ? value : d(value);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date, n) {
  const x = d(date);
  x.setDate(x.getDate() + Number(n) || 0);
  return x;
}

export function fmtDate(value) {
  const x = d(value);
  return x.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function monthsBetween(start, end) {
  const a = d(start);
  const b = d(end);
  let months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() >= a.getDate()) months += 1;
  return Math.max(0, months);
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

export function roundTo(n, step) {
  const s = Number(step) || 1;
  const x = Number(n) || 0;
  if (s <= 0) return x;
  // Round UP to the nearest step. Work in integer cents so 2354.5 / 25
  // cannot fall just under 94.18 in IEEE and ceil the wrong way.
  const cents = Math.round(x * 100);
  const stepCents = Math.round(s * 100);
  return (Math.ceil(cents / stepCents) * stepCents) / 100;
}

export function money(n) {
  return (Number(n) || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
