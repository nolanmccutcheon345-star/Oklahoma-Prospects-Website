import { DRILLS } from "./content/drills";
import { EXERCISES } from "./content/exercises";
import type { DevelopmentData } from "./types";

export type SearchHit = {
  id: string;
  kind: "athlete" | "coach" | "drill" | "exercise";
  title: string;
  detail: string;
  athleteId?: string;
  desk?: string;
};

function norm(q: string) {
  return q.trim().toLowerCase();
}

export function searchPd(query: string, data: DevelopmentData): SearchHit[] {
  const q = norm(query);
  if (q.length < 1) return [];
  const hits: SearchHit[] = [];
  for (const row of data.athletes) {
    const hay = `${row.firstName} ${row.lastName} ${row.position} ${row.school} ${row.city}`.toLowerCase();
    if (hay.includes(q)) {
      hits.push({
        id: row.id,
        kind: "athlete",
        title: `${row.firstName} ${row.lastName}`,
        detail: `${row.sport} · ${row.position}`,
        athleteId: row.id,
        desk: "athletes",
      });
    }
  }
  for (const row of data.coaches) {
    const hay = `${row.name} ${row.email} ${row.specialties.join(" ")}`.toLowerCase();
    if (hay.includes(q)) {
      hits.push({
        id: row.id,
        kind: "coach",
        title: row.name,
        detail: row.specialties.join(" · "),
        desk: "coaches",
      });
    }
  }
  for (const row of DRILLS) {
    const hay = `${row.name} ${row.discipline} ${row.problem} ${row.solves}`.toLowerCase();
    if (hay.includes(q)) {
      hits.push({
        id: row.id,
        kind: "drill",
        title: row.name,
        detail: `${row.discipline} · ${row.problem}`,
        desk: "toolkit",
      });
    }
  }
  for (const row of EXERCISES) {
    const hay = `${row.name} ${row.category} ${row.equipment}`.toLowerCase();
    if (hay.includes(q)) {
      hits.push({
        id: row.id,
        kind: "exercise",
        title: row.name,
        detail: `${row.category} · ${row.equipment}`,
        desk: "toolkit",
      });
    }
  }
  return hits.slice(0, 12);
}

export function relativeLuminance(hex: string) {
  const raw = hex.replace("#", "");
  const n = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const rgb = [0, 1, 2].map((i) => parseInt(n.slice(i * 2, i * 2 + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(fg: string, bg: string) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

export function aaPass(fg: string, bg: string, large = false) {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

/** Surfaces actually used in the Train tab. Measured, not eyeballed. */
export const PD_CONTRAST_PAIRS: Array<{
  name: string;
  fg: string;
  bg: string;
  large?: boolean;
}> = [
  { name: "ink on paper", fg: "#0b1720", bg: "#f3f6f8" },
  { name: "ink on paper-2", fg: "#0b1720", bg: "#ffffff" },
  { name: "muted on paper", fg: "#3f4c56", bg: "#f3f6f8" },
  { name: "muted on paper-2", fg: "#3f4c56", bg: "#ffffff" },
  { name: "maroon on paper", fg: "#681c35", bg: "#f3f6f8" },
  { name: "maroon on paper-2", fg: "#681c35", bg: "#ffffff" },
  { name: "inverse on ink", fg: "#f4f8fb", bg: "#0b1720" },
  { name: "inverse on navy", fg: "#f4f8fb", bg: "#071b31" },
  { name: "inverse on maroon", fg: "#f4f8fb", bg: "#681c35" },
  { name: "powder on ink", fg: "#9ed8f3", bg: "#0b1720" },
  { name: "powder on navy", fg: "#9ed8f3", bg: "#071b31" },
  { name: "powder on maroon", fg: "#9ed8f3", bg: "#681c35" },
  { name: "fg-soft on ink", fg: "#bdccd6", bg: "#0b1720" },
  { name: "fg-soft on navy", fg: "#bdccd6", bg: "#071b31" },
  { name: "fg-soft on maroon", fg: "#bdccd6", bg: "#681c35" },
  { name: "maroon eyebrow on paper-2 (large)", fg: "#681c35", bg: "#ffffff", large: true },
];
