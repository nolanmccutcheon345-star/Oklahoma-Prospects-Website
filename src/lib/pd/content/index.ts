import type { AthleteSlice } from "@/lib/pd/context";
import { AGE_CURRICULUM } from "./age-curriculum";
import { BENCHMARKS_INIT } from "./benchmarks";
import { DIAGNOSTICS } from "./diagnostics";
import { DRILLS } from "./drills";
import { FLAWS } from "./flaws";
import { IQ_BY_DISCIPLINE } from "./gameiq";
import { grade2080, gradeLabel, interpolatePercentile } from "./grade";
import type {
  BenchmarkKnot,
  BenchmarkMetric,
  DiagnosticSymptom,
  Discipline,
  Drill,
  IqBand,
} from "./types";

export { AGE_CURRICULUM } from "./age-curriculum";
export { BENCHMARKS_INIT } from "./benchmarks";
export { DIAGNOSTICS } from "./diagnostics";
export { DRILLS } from "./drills";
export { FLAWS } from "./flaws";
export { IQ_BY_DISCIPLINE, IQ_CATCHING, IQ_HITTING, IQ_PITCHING } from "./gameiq";
export type {
  AgeCurriculum,
  BenchmarkKnot,
  BenchmarkMetric,
  DiagnosticCause,
  DiagnosticSymptom,
  Discipline,
  Drill,
  Flaw,
  GameIqModule,
  IqBand,
} from "./types";

export const DISCIPLINES: Discipline[] = ["Pitching", "Hitting", "Catching", "Fielding"];

const DRILL_INDEX = new Map(DRILLS.map((row) => [row.id, row]));

export function drillById(id: string): Drill | undefined {
  return DRILL_INDEX.get(id);
}

export function drillProblems(discipline?: Discipline | "All"): string[] {
  const rows =
    !discipline || discipline === "All"
      ? DRILLS
      : DRILLS.filter((row) => row.discipline === discipline);
  return Array.from(new Set(rows.map((row) => row.problem)));
}

export function filterDrills(opts: {
  discipline?: Discipline | "All";
  problem?: string | "All";
  familySafeOnly?: boolean;
  level?: number;
}): Drill[] {
  return DRILLS.filter((row) => {
    if (opts.discipline && opts.discipline !== "All" && row.discipline !== opts.discipline) {
      return false;
    }
    if (opts.problem && opts.problem !== "All" && row.problem !== opts.problem) return false;
    if (opts.familySafeOnly && !row.familySafe) return false;
    if (opts.level && !row.levels.includes(opts.level)) return false;
    return true;
  });
}

export function primaryDiscipline(position: string, sport: string): Discipline {
  const pos = position.toLowerCase();
  if (pos.includes("c") && !pos.includes("cf") && pos !== "rhp" && pos !== "lhp") {
    if (pos === "c" || pos.startsWith("c ") || pos.includes("catch")) return "Catching";
  }
  if (/\b(ss|2b|3b|1b|of|cf|lf|rf|inf)\b/.test(pos)) return "Fielding";
  if (pos.includes("hit") || pos.includes("dh")) return "Hitting";
  if (sport === "softball" && (pos.includes("rhp") || pos.includes("lhp") || pos.includes("p"))) {
    return "Pitching";
  }
  if (pos.includes("hp") || pos.includes("pitch") || pos === "p") return "Pitching";
  return "Pitching";
}

export function ageBandLabel(age: number, college = false): string {
  if (college || age >= 19) return "College";
  if (age <= 8) return "8U";
  if (age <= 10) return "10U";
  if (age <= 12) return "12U";
  if (age <= 14) return "14U";
  if (age <= 16) return "16U";
  return "18U";
}

export function curriculumForAge(age: number) {
  if (age <= 8) return AGE_CURRICULUM[0];
  if (age <= 10) return AGE_CURRICULUM[1];
  if (age <= 12) return AGE_CURRICULUM[2];
  if (age <= 14) return AGE_CURRICULUM[3];
  if (age <= 16) return AGE_CURRICULUM[4];
  return AGE_CURRICULUM[5];
}

export function iqBandForAge(age: number): IqBand {
  if (age <= 12) return "youth";
  if (age <= 15) return "developing";
  return "advanced";
}

export function chartedMissText(slice: AthleteSlice): string {
  return [
    ...slice.diagnose.map((row) => row.finding),
    ...slice.plans.map((row) => `${row.focus} ${row.constraint}`),
    ...slice.evaluations.map((row) => row.summary),
    ...slice.scorecards.map((row) => row.notes),
    slice.athlete.notes,
  ]
    .join(" ")
    .toLowerCase();
}

function symptomScore(symptom: string, text: string, discipline: Discipline, primary: Discipline): number {
  let score = discipline === primary ? 2 : 0;
  const s = symptom.toLowerCase();
  const hits: [string, string, number][] = [
    ["arm side", "arm side", 12],
    ["glove side", "glove", 12],
    ["velocity", "velo", 8],
    ["velocity", "decel", 8],
    ["command", "command", 6],
    ["secondary", "slider", 6],
    ["secondary", "change", 4],
    ["pop time", "pop", 12],
    ["pop time", "transfer", 10],
    ["dirt", "block", 8],
    ["strikes getting called balls", "receive", 6],
    ["outer third", "oppo", 8],
    ["pull side", "pull", 6],
    ["late on fastballs", "late", 6],
    ["ground balls", "ground", 4],
    ["routes", "drop-step", 6],
    ["across the body", "across", 10],
  ];
  for (const [needle, key, pts] of hits) {
    if (s.includes(needle) && text.includes(key)) score += pts;
  }
  return score;
}

export function rankedDiagnostics(slice: AthleteSlice): {
  discipline: Discipline;
  rows: DiagnosticSymptom[];
  matched: DiagnosticSymptom | null;
} {
  const primary = primaryDiscipline(slice.athlete.position, slice.athlete.sport);
  const text = chartedMissText(slice);
  const rows = DIAGNOSTICS[primary] ?? DIAGNOSTICS.Pitching;
  const scored = rows
    .map((row) => ({ row, score: symptomScore(row.symptom, text, primary, primary) }))
    .sort((a, b) => b.score - a.score);
  const matched = text.trim() && scored[0] && scored[0].score >= 6 ? scored[0].row : null;
  const ordered = matched
    ? [matched, ...rows.filter((row) => row.symptom !== matched.symptom)]
    : rows;
  return { discipline: primary, rows: ordered, matched };
}

export { grade2080, gradeLabel, interpolatePercentile } from "./grade";

function parseNumber(raw: string | number | undefined | null): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export type Measurement = {
  key: string;
  value: number | null;
  unit: string;
};

export function measurementsFor(slice: AthleteSlice): Record<string, number | null> {
  const lastVelo = slice.velocity.length ? slice.velocity[slice.velocity.length - 1].mph : null;
  const lastTci = slice.bullpens.length ? slice.bullpens[slice.bullpens.length - 1].tci : null;
  const pop = slice.physicalTests.find((row) => /pop/i.test(row.test));
  const sixty = slice.physicalTests.find((row) => /60|sixty/i.test(row.test));
  const exit = slice.physicalTests.find((row) => /exit/i.test(row.test));
  const bat = slice.metrics.find((row) => /bat speed/i.test(row.name));
  const inf = slice.metrics.find((row) => /infield/i.test(row.name));
  const out = slice.metrics.find((row) => /outfield/i.test(row.name));
  const over = slice.metrics.find((row) => /overhand/i.test(row.name));
  const h1 = slice.physicalTests.find((row) => /home to first|1st/i.test(row.test));
  return {
    fastballVelo: lastVelo,
    pitchVelo: lastVelo,
    tci: lastTci,
    movementScore: slice.athlete.movementScore ?? null,
    popTime: parseNumber(pop?.value),
    sixty: parseNumber(sixty?.value),
    exitVelo: parseNumber(exit?.value),
    batSpeed: parseNumber(bat?.value),
    infieldVelo: parseNumber(inf?.value),
    outfieldVelo: parseNumber(out?.value),
    overhandVelo: parseNumber(over?.value),
    homeToFirst: parseNumber(h1?.value),
  };
}

export type GradedRow = {
  key: string;
  label: string;
  unit: string;
  source: string;
  band: string;
  knots: BenchmarkKnot[];
  value: number | null;
  percentile: number | null;
  grade: number | null;
  gradeName: string;
  lower: boolean;
};

function metricBand(
  metric: BenchmarkMetric,
  bandKey: string,
): { band: string; knots: BenchmarkKnot[] } | null {
  const knots = metric.bands[bandKey] ?? metric.bands[Number(bandKey)];
  if (!knots) return null;
  return { band: bandKey, knots: [...knots] };
}

export function peerGrades(slice: AthleteSlice, age: number): GradedRow[] {
  const sport = slice.athlete.sport === "softball" ? "softball" : "baseball";
  const college = slice.athlete.opLevel === 7 || age >= 19;
  const band = ageBandLabel(age, college);
  const measures = measurementsFor(slice);
  const pos = slice.athlete.position.toLowerCase();
  const tables = BENCHMARKS_INIT[sport] as unknown as Record<string, BenchmarkMetric>;
  const rows: GradedRow[] = [];
  const catcher = pos === "c" || pos.includes("catch");
  const inf = /\b(ss|2b|3b|1b|inf)\b/.test(pos);
  const of = /\b(of|cf|lf|rf)\b/.test(pos);
  const pitcher = /hp|pitch|^p$/.test(pos);
  const hitter = /hit|dh/.test(pos) || inf || of;
  const wanted = Object.keys(tables).filter((key) => {
    if (key === "popTime") return catcher;
    if (key === "infieldVelo") return inf;
    if (key === "outfieldVelo") return of;
    if (key === "pitchVelo" || key === "fastballVelo") return pitcher;
    if (key === "exitVelo" || key === "batSpeed") return hitter && !pitcher;
    if (key === "sixty") return sport === "baseball";
    if (key === "overhandVelo") return sport === "softball" && !pitcher;
    if (key === "homeToFirst") return sport === "softball";
    return true;
  });

  for (const key of wanted) {
    const metric = tables[key];
    const found = metricBand(metric, band);
    if (!found) continue;
    const value = measures[key] ?? null;
    const lower = Boolean(metric.lower);
    const percentile = value == null ? null : interpolatePercentile(value, found.knots, lower);
    const grade = percentile == null ? null : grade2080(percentile);
    rows.push({
      key,
      label: metric.label,
      unit: metric.unit,
      source: metric.source,
      band: found.band,
      knots: found.knots,
      value,
      percentile: percentile == null ? null : Math.round(percentile),
      grade,
      gradeName: grade == null ? "No reading" : gradeLabel(grade),
      lower,
    });
  }

  const op = slice.athlete.opLevel;
  if (op >= 1) {
    for (const [key, metric] of Object.entries(BENCHMARKS_INIT.internal) as unknown as [
      string,
      BenchmarkMetric,
    ][]) {
      const found = metricBand(metric, String(op));
      if (!found) continue;
      const value = measures[key] ?? null;
      const percentile = value == null ? null : interpolatePercentile(value, found.knots, false);
      const grade = percentile == null ? null : grade2080(percentile);
      rows.push({
        key,
        label: metric.label,
        unit: metric.unit,
        source: metric.source,
        band: `OP-${op}`,
        knots: found.knots,
        value,
        percentile: percentile == null ? null : Math.round(percentile),
        grade,
        gradeName: grade == null ? "No reading" : gradeLabel(grade),
        lower: false,
      });
    }
  }

  return rows;
}

export function iqModulesFor(slice: AthleteSlice, age: number) {
  const primary = primaryDiscipline(slice.athlete.position, slice.athlete.sport);
  const disc = primary === "Fielding" ? "Hitting" : primary;
  const band = iqBandForAge(age);
  const all = IQ_BY_DISCIPLINE[disc] ?? IQ_BY_DISCIPLINE.Pitching;
  return {
    discipline: disc,
    band,
    rows: all.filter((row) => row.band === band),
    all,
  };
}
