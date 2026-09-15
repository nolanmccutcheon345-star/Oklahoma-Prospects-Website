import {
  BANDS,
  FEATURE_MIN_TIER,
  NOW,
  PILLARS,
  SCORECARD,
  SCORE_LABELS,
  buildCohort,
  canReschedule,
  churnRisk,
  classifyFastball,
  loadStats,
  pdiFrom,
  planExecutionSteps,
  planHasFeature,
  restRequired,
  scorePitch,
  tciOf,
  velocityPotential,
} from "./core-algorithms.js";
import type { AthleteSlice } from "./context";
import type {
  Athlete,
  Booking,
  Bullpen,
  DevelopmentData,
  Family,
} from "./types";

export const CLUB_DAY_ISO = "2026-09-14";

export function ageOnClubDay(iso: string, dayIso = CLUB_DAY_ISO) {
  const day = new Date(`${dayIso}T12:00:00Z`);
  const born = new Date(`${iso}T12:00:00Z`);
  let age = day.getUTCFullYear() - born.getUTCFullYear();
  const month = day.getUTCMonth() - born.getUTCMonth();
  if (month < 0 || (month === 0 && day.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

function dateLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function engineStatus(row: Booking) {
  if (row.status === "cancelled") return "Cancelled";
  if (row.status === "waitlist") return "Waitlist";
  if (row.status === "unconfirmed") return "Paid";
  if (row.date < CLUB_DAY_ISO) return "Completed";
  return "Paid";
}

function liftMap(logs: AthleteSlice["strengthLog"] | DevelopmentData["strengthLog"]) {
  const last: { lmj?: number; mbRot?: number; trapBar?: number } = {};
  for (const row of logs) {
    const name = row.lift.toLowerCase();
    if (name.includes("lateral") || name.includes("lmj")) last.lmj = row.value;
    if (name.includes("med-ball") || name.includes("med ball") || name.includes("rotational")) {
      last.mbRot = row.value;
    }
    if (name.includes("trap")) last.trapBar = row.value;
  }
  return last;
}

function scorecardMap(slice: AthleteSlice) {
  const card = slice.scorecards[0];
  if (!card) return null;
  const scores: Record<string, number> = {};
  for (const cat of card.categories) {
    const key = SCORECARD.find(
      (row: { key: string; label: string }) =>
        row.label.toLowerCase() === cat.name.toLowerCase() ||
        row.key === cat.name.toLowerCase().replace(/\s+/g, ""),
    )?.key;
    if (key) scores[key] = cat.score;
  }
  return Object.keys(scores).length ? scores : null;
}

export function toEngineAthlete(slice: AthleteSlice) {
  const age = ageOnClubDay(slice.athlete.birthDate);
  const veloHistory = [...slice.velocity].sort((a, b) => a.date.localeCompare(b.date)).map((row) => row.mph);
  const tciHistory = [...slice.bullpens]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      if (row.chart && row.chart.length) {
        const pitches = row.chart.map((p) => ({
          ...p,
          score: p.score ?? scorePitch(p.intent, p.actual),
        }));
        return tciOf(pitches);
      }
      return row.tci ?? 0;
    });
  const kpi = liftMap(slice.strengthLog);
  const sixty = slice.physicalTests.find((row) => /60|sixty/i.test(row.test));
  const metrics: Record<string, number | string> = {};
  for (const row of slice.metrics) {
    if (/ivb/i.test(row.name)) metrics.ivb = parseFloat(row.value);
    if (/\bhb\b|horz/i.test(row.name)) metrics.hb = parseFloat(row.value);
    if (/60|sixty/i.test(row.name)) metrics.sixty = parseFloat(row.value);
  }
  if (sixty) metrics.sixty = parseFloat(sixty.value);
  return {
    id: slice.athlete.id,
    name: `${slice.athlete.firstName} ${slice.athlete.lastName}`,
    sport: slice.athlete.sport,
    sex: slice.athlete.sex,
    age,
    archived: Boolean(slice.athlete.archived),
    frame: slice.athlete.frame ?? {},
    movementScore: slice.athlete.movementScore,
    veloHistory,
    tciHistory,
    tci: tciHistory.length ? tciHistory[tciHistory.length - 1] : null,
    strengthLog: Object.keys(kpi).length ? [kpi] : [],
    metrics,
    pointsLog: slice.pointsLog,
    reportCard: slice.athlete.assessmentComplete || slice.reportCards.length > 0,
  };
}

function athleteFromData(data: DevelopmentData, row: Athlete) {
  const age = ageOnClubDay(row.birthDate);
  const veloHistory = data.velocity
    .filter((v) => v.athleteId === row.id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((v) => v.mph);
  const pens = data.bullpens
    .filter((v) => v.athleteId === row.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const tciHistory = pens.map((pen) => {
    if (pen.chart && pen.chart.length) {
      return tciOf(
        pen.chart.map((p) => ({ ...p, score: p.score ?? scorePitch(p.intent, p.actual) })),
      );
    }
    return pen.tci ?? 0;
  });
  const kpi = liftMap(data.strengthLog.filter((v) => v.athleteId === row.id));
  return {
    id: row.id,
    name: `${row.firstName} ${row.lastName}`,
    sport: row.sport,
    sex: row.sex,
    age,
    archived: Boolean(row.archived),
    frame: row.frame ?? {},
    movementScore: row.movementScore,
    veloHistory,
    tciHistory,
    tci: tciHistory.length ? tciHistory[tciHistory.length - 1] : null,
    strengthLog: Object.keys(kpi).length ? [kpi] : [],
    metrics: {},
    pointsLog: data.pointsLog.filter((v) => v.athleteId === row.id),
    reportCard: row.assessmentComplete || data.reportCards.some((v) => v.athleteId === row.id),
  };
}

export function toEngineData(data: DevelopmentData) {
  return {
    ...data,
    athletes: data.athletes.map((row) => athleteFromData(data, row)),
    bookings: data.bookings.map((row) => ({
      ...row,
      status: engineStatus(row),
      dateLabel: row.dateLabel ?? dateLabel(row.date),
      rescheduledMonth: row.rescheduledMonth,
    })),
    policy: {
      ...data.policy,
      rescheduleDaysNotice: data.policy.rescheduleDaysNotice,
      reschedulesPerMonth: data.policy.reschedulesPerMonth,
    },
  };
}

export function velocityFor(slice: AthleteSlice) {
  return velocityPotential(toEngineAthlete(slice));
}

export function cohortFor(slice: AthleteSlice, data: DevelopmentData, metricKey = "velo") {
  return buildCohort(toEngineData(data), toEngineAthlete(slice), metricKey);
}

export function dailyLoad(slice: AthleteSlice) {
  const end = NOW();
  const map = new Map(slice.workload.map((row) => [row.date, row.throws]));
  const out: number[] = [];
  const labels: string[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date(end.getTime());
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    labels.push(iso);
    out.push(map.get(iso) ?? 0);
  }
  if (!slice.workload.length) return { history: [] as number[], labels: [] as string[] };
  return { history: out, labels };
}

export function workloadFor(slice: AthleteSlice) {
  const { history, labels } = dailyLoad(slice);
  const stats = loadStats(history);
  const age = ageOnClubDay(slice.athlete.birthDate);
  const lastHigh = [...slice.workload].sort((a, b) => b.date.localeCompare(a.date))[0];
  const lastOuting = [...slice.outings].sort((a, b) => b.date.localeCompare(a.date))[0];
  const pitchCount = lastOuting?.pitches ?? lastHigh?.throws ?? 0;
  const restDays = pitchCount ? restRequired(age, pitchCount) : 0;
  const restFrom = lastOuting?.date ?? lastHigh?.date;
  return { stats, history, labels, restDays, restFrom, pitchCount, age };
}

export function sessionRestWarning(
  slice: AthleteSlice,
  booking: { date: string },
) {
  const w = workloadFor(slice);
  if (!w.restDays || !w.restFrom) return null;
  const from = new Date(`${w.restFrom}T12:00:00Z`);
  const clear = new Date(from);
  clear.setUTCDate(clear.getUTCDate() + w.restDays);
  const session = new Date(`${booking.date}T12:00:00Z`);
  if (session >= clear) return null;
  const left = Math.ceil((clear.getTime() - session.getTime()) / 864e5);
  return {
    days: w.restDays,
    restFrom: w.restFrom,
    pitchCount: w.pitchCount,
    clearOn: clear.toISOString().slice(0, 10),
    inside: true,
    left,
    band: BANDS.find((b: { key: string; ages?: unknown }) => {
      if (w.age <= 12) return b.key === "youth";
      if (w.age <= 15) return b.key === "developing";
      return b.key === "advanced";
    }),
  };
}

export function scoredChart(pen: Bullpen) {
  const chart = pen.chart ?? [];
  const pitches = chart.map((p) => ({
    intent: p.intent,
    actual: p.actual,
    score: p.score ?? scorePitch(p.intent, p.actual),
  }));
  return { pitches, tci: tciOf(pitches), labels: SCORE_LABELS };
}

export function scorecardIndex(slice: AthleteSlice) {
  return pdiFrom(scorecardMap(slice));
}

export function churnForFamily(family: Family, data: DevelopmentData) {
  return churnRisk(family, toEngineData(data));
}

export function rescheduleFor(booking: Booking, family: Family, data: DevelopmentData) {
  return canReschedule(
    { ...booking, dateLabel: booking.dateLabel ?? dateLabel(booking.date) },
    family,
    toEngineData(data),
  );
}

export function featuresForTier(tier: string | undefined) {
  const keys = Object.keys(FEATURE_MIN_TIER) as (keyof typeof FEATURE_MIN_TIER)[];
  return keys.map((feature) => ({
    feature,
    min: FEATURE_MIN_TIER[feature] as string,
    has: tier ? planHasFeature(tier, feature) : false,
  }));
}

export function stepsForPlan(family: Family | undefined, athlete: ReturnType<typeof toEngineAthlete> | Athlete) {
  if (!family?.plan) return [];
  const membership = {
    lessons: family.plan.lessons ?? 4,
    remote: family.plan.remote ?? 0,
    tier: family.plan.tier ?? family.plan.type,
  };
  const reportCard = "reportCard" in athlete ? athlete.reportCard : false;
  return planExecutionSteps(membership, { reportCard });
}

export function fastballFor(slice: AthleteSlice) {
  const ivb = slice.metrics.find((row) => /ivb/i.test(row.name));
  const hb = slice.metrics.find((row) => /\bhb\b|horz/i.test(row.name));
  if (!ivb || !hb) return null;
  return classifyFastball(parseFloat(ivb.value), parseFloat(hb.value), slice.athlete.throws);
}

export { SCORE_LABELS, PILLARS, SCORECARD, FEATURE_MIN_TIER, BANDS, scorePitch, tciOf };
