import {
  BANDS,
  calibrationResult,
  classifyFastball,
  interventionStats,
  parseTrackingCsv,
} from "./core-algorithms.js";
import { ageOnClubDay, CLUB_DAY_ISO, cohortFor, toEngineData } from "./engines";
import type { AthleteSlice } from "./context";
import type { DevelopmentData } from "./types";

export const CALIB_DOMAINS = [
  { key: "posture", label: "Delivery" },
  { key: "direction", label: "Direction" },
  { key: "stride", label: "Lower half" },
  { key: "separation", label: "Trunk" },
  { key: "slot", label: "Arm action" },
  { key: "balance", label: "Lead leg" },
] as const;

export type CalibKey = (typeof CALIB_DOMAINS)[number]["key"];
export type CalibScores = Record<CalibKey, number>;

export type CalibCase = {
  id: string;
  title: string;
  athlete: string;
  ageBand: string;
  hand: string;
  sport: "pitching" | "hitting";
  prompt: string;
  conservativeNote?: string;
  views: { label: string; src: string; hint: string }[];
  truth: CalibScores;
};

export const CALIB_CASES: CalibCase[] = [
  {
    id: "case-15u-rhp",
    title: "15U RHP",
    athlete: "Reference — not a roster athlete",
    ageBand: "developing",
    hand: "R",
    sport: "pitching",
    prompt:
      "Open-side and rear. Score what you can see. Delivery leaking open. Trunk is late. Don't invent a lead-leg issue you cannot confirm.",
    views: [
      { label: "Open side", src: "/brand/training.jpg", hint: "Glove side and trunk. Watch the open." },
      { label: "Rear", src: "/brand/facility.jpg", hint: "Direction and lead leg from behind." },
    ],
    truth: { posture: 1, direction: 2, stride: 2, separation: 1, slot: 2, balance: 2 },
  },
  {
    id: "case-13u-lhp",
    title: "13U LHP · rear only",
    athlete: "Reference — mid-growth-spurt",
    ageBand: "developing",
    hand: "L",
    sport: "pitching",
    prompt:
      "One camera, rear only, mid-growth-spurt. Scoring conservatively is correct. A 3 from this view is a guess.",
    conservativeNote: "You cannot see the glove side. Leave delivery and trunk at 1 unless the rear view is obvious.",
    views: [
      { label: "Rear only", src: "/brand/team.jpg", hint: "This is the only angle. Do not fill in the open side." },
    ],
    truth: { posture: 1, direction: 1, stride: 1, separation: 1, slot: 2, balance: 1 },
  },
  {
    id: "case-16u-rhh",
    title: "16U RHH",
    athlete: "Reference — timing vs barrel",
    ageBand: "advanced",
    hand: "R",
    sport: "hitting",
    prompt:
      "Separate a timing problem from a barrel problem. Front foot is early. The barrel path is actually fine.",
    views: [
      { label: "Open side", src: "/brand/training.jpg", hint: "Front foot and the barrel through the zone." },
      { label: "Catcher view", src: "/brand/facility.jpg", hint: "Contact point. Don't call a barrel issue if the miss is early." },
    ],
    truth: { posture: 2, direction: 2, stride: 1, separation: 1, slot: 2, balance: 1 },
  },
];

const HEADER_REMAP: Record<string, string> = {
  releasespeed: "velocity",
  pitchspeed: "velocity",
  releasevelo: "velocity",
  pitchvelo: "velocity",
  totalspin: "spin",
  inducedverticalbreak: "ivb",
  inducedvertbreak: "ivb",
  horizontalbreak: "hb",
};

export function normalizeTrackingCsv(text: string) {
  const lines = text.split(/\r?\n/);
  if (!lines[0]) return text;
  const header = lines[0].split(",").map((raw) => {
    const stripped = raw.replace(/^"|"$/g, "").trim();
    const key = stripped.toLowerCase().replace(/[\s_]+/g, "");
    return HEADER_REMAP[key] ?? stripped;
  });
  lines[0] = header.join(",");
  return lines.join("\n");
}

export function parseTrackingFile(text: string) {
  return parseTrackingCsv(normalizeTrackingCsv(text)) as
    | { error: string }
    | {
        pitches: Array<{
          velo: number;
          spin: number | null;
          ivb: number | null;
          hb: number | null;
          ext: number | null;
          height: number | null;
          type: string;
        }>;
        skipped: Array<{ row: number; why: string }>;
        headers: string[];
        count: number;
        maxVelo: number;
        avgVelo: number;
        byType: Array<{
          type: string;
          n: number;
          avgVelo: number | null;
          maxVelo: number;
          spin: number | null;
          ivb: number | null;
          hb: number | null;
        }>;
      };
}

export function trackingApplyRows(
  parsed: Exclude<ReturnType<typeof parseTrackingFile>, { error: string }>,
  athleteId: string,
  throws: "R" | "L",
  date = CLUB_DAY_ISO,
) {
  const fb = parsed.byType.find((row) => /fb|fast|four|sink|ride|cut/i.test(row.type)) ?? parsed.byType[0];
  const identity =
    fb && fb.ivb != null && fb.hb != null ? classifyFastball(fb.ivb, fb.hb, throws) : null;
  const velocity = {
    id: `v-imp-${Date.now()}`,
    athleteId,
    date,
    mph: parsed.maxVelo,
  };
  const metrics = [
    { name: "Spin", value: `${fb?.spin ?? "—"} rpm` },
    { name: "IVB", value: `${fb?.ivb ?? "—"} in` },
    { name: "HB", value: `${fb?.hb ?? "—"} in` },
    { name: "Avg velo", value: `${parsed.avgVelo} mph` },
  ].map((row, i) => ({
    id: `mt-imp-${i}-${Date.now()}`,
    athleteId,
    date,
    name: row.name,
    value: row.value,
  }));
  const arsenal = parsed.byType.map((row, i) => ({
    id: `ar-imp-${i}-${Date.now()}`,
    athleteId,
    pitch: row.type || "Unspecified",
    role: row.type && /fb|fast/i.test(row.type) && identity ? `${identity} fastball` : "Imported",
    velo: String(row.avgVelo ?? row.maxVelo),
  }));
  return { velocity, metrics, arsenal, identity, fb };
}

export function bandForAge(age: number) {
  if (age <= 12) return "youth";
  if (age <= 15) return "developing";
  return "advanced";
}

export function evidenceRows(
  data: DevelopmentData,
  filter: { coachId?: string; band?: string } = {},
) {
  const rows = interventionStats(toEngineData(data), filter) as Array<{
    method: string;
    n: number;
    retained: number;
    retainRate: number;
    avgDelta: number | null;
  }>;
  return rows.map((row) => ({
    ...row,
    hint: row.n < 10,
  }));
}

export function coachVsTruth(scores: Partial<CalibScores>, truth: CalibScores) {
  return calibrationResult(scores, truth) as {
    exact: number;
    within1: number;
    off2: number;
    total: number;
    meanAbs: number;
    status: string;
  } | null;
}

export function domainSpread(scores: CalibScores[]) {
  return CALIB_DOMAINS.map((domain) => {
    const vals = scores.map((row) => row[domain.key]).filter((n) => n != null);
    if (vals.length < 2) return { ...domain, min: vals[0] ?? null, max: vals[0] ?? null, spread: 0, flag: false };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const spread = max - min;
    return { ...domain, min, max, spread, flag: spread >= 2 };
  });
}

export function facilityCaseReport(
  data: DevelopmentData,
  caseId: string,
) {
  const kase = CALIB_CASES.find((row) => row.id === caseId);
  if (!kase) return null;
  const submitted = (data.calibrationScores ?? []).filter((row) => row.caseId === caseId);
  const coaches = submitted.map((row) => {
    const coach = data.coaches.find((c) => c.id === row.coachId);
    return {
      coachId: row.coachId,
      name: coach?.name ?? row.coachId,
      scores: row.scores,
      vsTruth: coachVsTruth(row.scores, kase.truth),
    };
  });
  const spread = domainSpread(submitted.map((row) => row.scores));
  return { kase, coaches, spread, n: submitted.length };
}

export function cohortCopy(slice: AthleteSlice, data: DevelopmentData, metricKey = "velo") {
  const out = cohortFor(slice, data, metricKey);
  return out;
}

export function fmtDelta(n: number, unit: string) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

export { BANDS };
