import { POINT_VALUES } from "./core-algorithms.js";
import type { AthleteSlice } from "./context";
import {
  CLUB_DAY_ISO,
  ageOnClubDay,
  churnForFamily,
  sessionRestWarning,
  workloadFor,
} from "./engines";
import type {
  DevelopmentData,
  Family,
  PointsLog,
  RecordViewId,
  ViewerRole,
} from "./types";

export const POINT_ACTIVITIES = POINT_VALUES as Array<{
  key: string;
  label: string;
  points: number;
  icon: string;
}>;

export const HIGH_VALUE_KEYS = ["throwing", "workout", "drill"] as const;

export const POINTS_TARGETS = {
  youth: 80,
  developing: 130,
  advanced: 180,
} as const;

export type PointsBand = keyof typeof POINTS_TARGETS;

export type AlertBucket = "today" | "week" | "fyi";
export type AlertKind = "health" | "development" | "commercial";

export type PdAlert = {
  id: string;
  bucket: AlertBucket;
  kind: AlertKind;
  rank: number;
  title: string;
  detail: string;
  action: string;
  athleteId?: string;
  familyId?: string;
  view?: RecordViewId;
  desk?: string;
};

export type AlertScope = {
  role: ViewerRole;
  coachId?: string;
  familyId?: string;
  athleteId?: string;
};

const WEEK_START = weekStartIso(CLUB_DAY_ISO);

function weekStartIso(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

export function pointsBandForAge(age: number): PointsBand {
  if (age <= 12) return "youth";
  if (age <= 15) return "developing";
  return "advanced";
}

export function activityMeta(key: string) {
  return POINT_ACTIVITIES.find((row) => row.key === key);
}

export function isHighValue(key: string) {
  return (HIGH_VALUE_KEYS as readonly string[]).includes(key);
}

export function countsTowardWeek(row: PointsLog) {
  if (row.status === "pending") return false;
  return true;
}

export function activityPoints(slice: {
  athlete: { birthDate: string };
  pointsLog: PointsLog[];
}) {
  const age = ageOnClubDay(slice.athlete.birthDate);
  const band = pointsBandForAge(age);
  const target = POINTS_TARGETS[band];
  const week = slice.pointsLog.filter((row) => row.date >= WEEK_START && countsTowardWeek(row));
  const earned = week.reduce((sum, row) => sum + (Number(row.points) || 0), 0);
  const pending = slice.pointsLog.filter((row) => row.date >= WEEK_START && row.status === "pending");
  return { earned, target, met: earned >= target, band, pending: pending.length, week };
}

export function alreadyLogged(log: PointsLog[], athleteId: string, date: string, key: string) {
  return log.some(
    (row) => row.athleteId === athleteId && row.date === date && (row.activity ?? "") === key,
  );
}

export function creditDecision(
  data: DevelopmentData,
  input: { athleteId: string; key: string; date?: string },
): { ok: false; reason: string } | { ok: true; points: number; status: NonNullable<PointsLog["status"]>; reason: string } {
  const date = input.date ?? CLUB_DAY_ISO;
  const meta = activityMeta(input.key);
  if (!meta) return { ok: false, reason: "Unknown activity." };
  if (alreadyLogged(data.pointsLog, input.athleteId, date, input.key)) {
    return { ok: false, reason: "One log per type per day. Already on the board." };
  }
  const verify = data.policy.verifyActivities !== false;
  const high = isHighValue(input.key);
  const auto = input.key === "workout" || input.key === "checkin";
  const status: NonNullable<PointsLog["status"]> = auto ? "auto" : high && verify ? "pending" : "verified";
  return { ok: true, points: meta.points, status, reason: meta.label };
}

export const LB_AGE_GROUPS = [
  { id: "10U", label: "10U", test: (age: number) => age <= 10 },
  { id: "12U", label: "12U", test: (age: number) => age >= 11 && age <= 12 },
  { id: "14U", label: "14U", test: (age: number) => age >= 13 && age <= 14 },
  { id: "16U", label: "16U", test: (age: number) => age >= 15 && age <= 16 },
  { id: "18U", label: "18U", test: (age: number) => age >= 17 },
] as const;

export const LB_METRICS = [
  { id: "velo", label: "Velocity", unit: "mph" },
  { id: "tci", label: "Command (TCI)", unit: "" },
  { id: "points", label: "Weekly points", unit: "pts" },
  { id: "trap", label: "Trap-bar", unit: "lb" },
  { id: "medball", label: "Rotational med-ball", unit: "ft" },
  { id: "sessions", label: "Sessions this month", unit: "" },
] as const;

export type LbMetricId = (typeof LB_METRICS)[number]["id"];

function measure(data: DevelopmentData, athleteId: string, metric: LbMetricId): number | null {
  if (metric === "velo") {
    const rows = data.velocity.filter((row) => row.athleteId === athleteId).sort((a, b) => a.date.localeCompare(b.date));
    return rows.length ? rows[rows.length - 1].mph : null;
  }
  if (metric === "tci") {
    const rows = data.bullpens.filter((row) => row.athleteId === athleteId && row.tci != null);
    return rows.length ? Number(rows[rows.length - 1].tci) : null;
  }
  if (metric === "points") {
    const athlete = data.athletes.find((row) => row.id === athleteId);
    if (!athlete) return null;
    const pts = activityPoints({
      athlete,
      pointsLog: data.pointsLog.filter((row) => row.athleteId === athleteId),
    });
    return pts.week.length ? pts.earned : null;
  }
  if (metric === "trap") {
    const rows = data.strengthLog.filter((row) => row.athleteId === athleteId && /trap/i.test(row.lift));
    return rows.length ? rows[rows.length - 1].value : null;
  }
  if (metric === "medball") {
    const rows = [
      ...data.strengthLog.filter((row) => row.athleteId === athleteId && /med-ball|med ball|rotational/i.test(row.lift)),
      ...data.physicalTests
        .filter((row) => row.athleteId === athleteId && /med-ball|rotational/i.test(row.test))
        .map((row) => ({ value: parseFloat(row.value) })),
    ];
    const last = rows[rows.length - 1];
    return last && Number.isFinite(last.value) ? last.value : null;
  }
  const month = CLUB_DAY_ISO.slice(0, 7);
  const n = data.bookings.filter(
    (row) =>
      row.athleteId === athleteId &&
      row.date.startsWith(month) &&
      (row.status === "completed" || (row.status === "paid" && row.date < CLUB_DAY_ISO)),
  ).length + data.lessons.filter((row) => row.athleteId === athleteId && row.date.startsWith(month)).length;
  return n > 0 ? n : null;
}

export function leaderboardRows(
  data: DevelopmentData,
  metric: LbMetricId,
  groupId: string,
  opts?: { includeOptOutIds?: string[] },
) {
  const group = LB_AGE_GROUPS.find((row) => row.id === groupId) ?? LB_AGE_GROUPS[0];
  const rows = data.athletes
    .filter((row) => !row.archived && group.test(ageOnClubDay(row.birthDate)))
    .map((row) => {
      const family = data.families.find((f) => f.id === row.familyId);
      const opted = Boolean(family?.leaderboardOptOut);
      const value = measure(data, row.id, metric);
      return {
        id: row.id,
        name: `${row.firstName} ${row.lastName}`,
        value,
        opted,
        familyId: row.familyId,
      };
    })
    .filter((row) => row.value != null)
    .filter((row) => !row.opted || opts?.includeOptOutIds?.includes(row.id));
  const ranked = [...rows].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return ranked.map((row, index) => ({ ...row, place: index + 1 }));
}

export function ownStanding(
  data: DevelopmentData,
  athleteId: string,
  metric: LbMetricId,
) {
  const athlete = data.athletes.find((row) => row.id === athleteId);
  if (!athlete) return null;
  const age = ageOnClubDay(athlete.birthDate);
  const group = LB_AGE_GROUPS.find((row) => row.test(age));
  if (!group) return null;
  const value = measure(data, athleteId, metric);
  if (value == null) return { group: group.id, value: null, place: null, n: 0 };
  const full = leaderboardRows(data, metric, group.id, { includeOptOutIds: [athleteId] });
  const mine = full.find((row) => row.id === athleteId);
  return { group: group.id, value, place: mine?.place ?? null, n: full.length };
}

function tciTrend(data: DevelopmentData, athleteId: string) {
  const rows = data.bullpens
    .filter((row) => row.athleteId === athleteId && row.tci != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) return null;
  const prev = Number(rows[rows.length - 2].tci);
  const last = Number(rows[rows.length - 1].tci);
  if (last < prev - 8 || (last < 50 && last < prev)) {
    return { prev, last, date: rows[rows.length - 1].date };
  }
  return null;
}

function liteSlice(data: DevelopmentData, athleteId: string): AthleteSlice | null {
  const athlete = data.athletes.find((row) => row.id === athleteId);
  if (!athlete) return null;
  const of = <T extends { athleteId: string }>(rows: T[]) => rows.filter((row) => row.athleteId === athleteId);
  return {
    athlete,
    family: data.families.find((row) => row.id === athlete.familyId),
    coaches: data.coaches.filter((row) => athlete.coachIds.includes(row.id)),
    bookings: of(data.bookings),
    waitlist: of(data.waitlist),
    outings: of(data.outings),
    workoutLog: of(data.workoutLog),
    strengthLog: of(data.strengthLog),
    pointsLog: of(data.pointsLog),
    scorecards: of(data.scorecards),
    evaluations: of(data.evaluations),
    lessons: of(data.lessons),
    filmReviews: of(data.filmReviews),
    interventions: of(data.interventions),
    calibration: of(data.calibration),
    certifications: of(data.certifications),
    messages: of(data.messages),
    plans: of(data.plans),
    diagnose: of(data.diagnose),
    cohorts: data.cohorts.filter((row) => row.athleteIds.includes(athleteId)),
    gameIq: of(data.gameIq),
    reportCards: of(data.reportCards),
    velocity: of(data.velocity),
    goals: of(data.goals),
    arsenal: of(data.arsenal),
    pitchDesign: of(data.pitchDesign),
    skillPlans: of(data.skillPlans),
    warmups: of(data.warmups),
    strengthSets: of(data.strengthSets),
    throwingAssignments: of(data.throwingAssignments),
    bullpens: of(data.bullpens),
    workload: of(data.workload),
    armCare: of(data.armCare),
    physicalTests: of(data.physicalTests),
    metrics: of(data.metrics),
    recruiting: data.recruiting.find((row) => row.athleteId === athleteId),
    intake: data.intake.find((row) => row.athleteId === athleteId),
    videos: of(data.videos),
    documents: of(data.documents),
  };
}

export function buildAlerts(data: DevelopmentData, scope: AlertScope): PdAlert[] {
  const out: PdAlert[] = [];
  const athletes = data.athletes.filter((row) => {
    if (row.archived) return false;
    if (scope.athleteId) return row.id === scope.athleteId;
    if (scope.familyId) return row.familyId === scope.familyId;
    if (scope.role === "coach" && scope.coachId) return row.coachIds.includes(scope.coachId);
    if (scope.role === "player" && scope.athleteId) return row.id === scope.athleteId;
    return true;
  });
  const athleteIds = new Set(athletes.map((row) => row.id));

  for (const athlete of athletes) {
    const name = athlete.firstName;
    const slice = liteSlice(data, athlete.id);
    if (!slice) continue;

    const arm = [...slice.armCare].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (arm && arm.feel >= 6) {
      const today = arm.date >= "2026-09-13";
      out.push({
        id: `arm-${athlete.id}`,
        bucket: today ? "today" : "week",
        kind: "health",
        rank: arm.feel >= 7 ? 1 : 4,
        title: `${name}: arm feel ${arm.feel}/10`,
        detail: arm.notes || "Reported soreness at 6 or above.",
        action: "Open arm care. No mound until feel is under 4.",
        athleteId: athlete.id,
        view: "arm-care",
      });
    }

    const load = workloadFor(slice);
    if (load.stats.tone === "warn") {
      out.push({
        id: `acwr-${athlete.id}`,
        bucket: "today",
        kind: "health",
        rank: 2,
        title: `${name}: workload spike`,
        detail: `Acute:chronic ${load.stats.acwr}. ${load.stats.band}`,
        action: "Open workload. Cut high-intent throwing until the ratio is back under 1.3.",
        athleteId: athlete.id,
        view: "workload",
      });
    }

    const rest = sessionRestWarning(slice, { date: CLUB_DAY_ISO });
    if (rest?.inside) {
      out.push({
        id: `rest-${athlete.id}`,
        bucket: "today",
        kind: "health",
        rank: 3,
        title: `${name}: inside required rest`,
        detail: `${rest.pitchCount} pitches · ${rest.days}-day rest · clear ${rest.clearOn}.`,
        action: "Do not start a pen. Move the session or make it catch play.",
        athleteId: athlete.id,
        view: "workload",
      });
    }

    const trend = tciTrend(data, athlete.id);
    if (trend) {
      out.push({
        id: `tci-${athlete.id}`,
        bucket: "today",
        kind: "health",
        rank: 5,
        title: `${name}: command sliding`,
        detail: `TCI ${trend.prev} → ${trend.last}.`,
        action: "Open bullpens. One constraint, then stop. Don't pile work on a decaying arm.",
        athleteId: athlete.id,
        view: "bullpens",
      });
    }

    if (!athlete.assessmentComplete) {
      out.push({
        id: `assess-${athlete.id}`,
        bucket: "week",
        kind: "development",
        rank: 110,
        title: `${name}: no baseline assessment`,
        detail: "Nothing to show progress against. Families cancel when they can't see it.",
        action: "Book the assessment this week — two specific times, not an open question.",
        athleteId: athlete.id,
        view: "intake",
        desk: "intake",
      });
    }

    const pts = activityPoints(slice);
    if (athlete.assessmentComplete && !pts.met) {
      out.push({
        id: `pts-${athlete.id}`,
        bucket: "week",
        kind: "development",
        rank: 120,
        title: `${name}: ${pts.earned} of ${pts.target} weekly points`,
        detail: `${pts.band} target. High-value work still pending: ${pts.pending}.`,
        action: "Shrink the assignment until it gets done. Ask the athlete, not the parent.",
        athleteId: athlete.id,
        view: "points",
      });
    }

    const pending = slice.pointsLog.filter((row) => row.status === "pending");
    if (pending.length) {
      out.push({
        id: `verify-${athlete.id}`,
        bucket: "today",
        kind: "development",
        rank: 130,
        title: `${name}: ${pending.length} activit${pending.length === 1 ? "y" : "ies"} waiting on you`,
        detail: pending.map((row) => row.reason).join(" · "),
        action: "Verify the throwing / workout / drill log. It does not count until you do.",
        athleteId: athlete.id,
        view: "points",
      });
    }

    const waiver = slice.documents.some((row) => /waiver/i.test(row.kind) || /waiver/i.test(row.name));
    if (!waiver) {
      out.push({
        id: `card-${athlete.id}`,
        bucket: "fyi",
        kind: "commercial",
        rank: 240,
        title: `${name}: missing waiver`,
        detail: "No signed card on file.",
        action: "Send the waiver link before the next session.",
        athleteId: athlete.id,
        view: "documents",
      });
    }

    const age = ageOnClubDay(athlete.birthDate);
    if (age >= 16 && slice.certifications.length === 0) {
      out.push({
        id: `cert-${athlete.id}`,
        bucket: "fyi",
        kind: "commercial",
        rank: 250,
        title: `${name}: no certification on file`,
        detail: "16U+ without a physical or showcase card.",
        action: "Ask the parent for the physical. Don't guess it's done.",
        athleteId: athlete.id,
        view: "recruiting",
      });
    }
  }

  for (const row of data.bookings) {
    if (!athleteIds.has(row.athleteId)) continue;
    if (row.status !== "unconfirmed") continue;
    const athlete = data.athletes.find((a) => a.id === row.athleteId);
    out.push({
      id: `book-${row.id}`,
      bucket: "today",
      kind: "commercial",
      rank: 210,
      title: `${athlete?.firstName ?? "Athlete"}: unconfirmed session`,
      detail: `${row.date} · ${row.time}. Proposed, not approved.`,
      action: "Ping the family with the exact slot. Don't wait for them to notice.",
      athleteId: row.athleteId,
      desk: "today",
    });
  }

  for (const row of data.waitlist) {
    if (row.status && row.status !== "open") continue;
    if (!athleteIds.has(row.athleteId)) continue;
    const athlete = data.athletes.find((a) => a.id === row.athleteId);
    out.push({
      id: `wait-${row.id}`,
      bucket: "week",
      kind: "commercial",
      rank: 220,
      title: `${athlete?.firstName ?? "Athlete"} is on the waitlist`,
      detail: `${row.preferredDay ?? "Any day"} · ${row.preferredTime ?? "any time"}.`,
      action: "Offer a real opening that matches the preference.",
      athleteId: row.athleteId,
      desk: "today",
    });
  }

  if (scope.role === "admin") {
    for (const lead of data.leads.filter((row) => row.status === "new")) {
      out.push({
        id: `lead-${lead.id}`,
        bucket: "fyi",
        kind: "commercial",
        rank: 260,
        title: `New lead: ${lead.name}`,
        detail: `${lead.source} · ${lead.phone}`,
        action: "Call today. Offer two specific assessment times.",
        desk: "business",
      });
    }
  }

  const families = data.families.filter((family) => {
    if (scope.familyId) return family.id === scope.familyId;
    if (scope.role === "coach" && scope.coachId) {
      return family.athleteIds.some((id) => data.athletes.find((a) => a.id === id)?.coachIds.includes(scope.coachId!));
    }
    if (scope.role === "player") return false;
    return family.athleteIds.some((id) => athleteIds.has(id));
  });

  for (const family of families) {
    const risk = churnForFamily(family, data);
    if (!risk) continue;
    out.push({
      id: `churn-${family.id}`,
      bucket: risk.level === "high" ? "today" : "week",
      kind: "commercial",
      rank: risk.level === "high" ? 200 : 230,
      title: `${family.name}: ${risk.level} churn risk`,
      detail: risk.signals[0]?.label ?? `Score ${risk.score}`,
      action: risk.signals[0]?.fix ?? "Offer two specific times this week — an open question gets ignored, a concrete slot gets answered.",
      familyId: family.id,
      athleteId: family.athleteIds[0],
      desk: "retention",
    });
  }

  const filtered = out.filter((row) => {
    if (scope.role === "player") return row.kind === "health" || row.view === "points";
    return true;
  });

  return filtered.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
}

export function alertsByBucket(rows: PdAlert[]) {
  return {
    today: rows.filter((row) => row.bucket === "today"),
    week: rows.filter((row) => row.bucket === "week"),
    fyi: rows.filter((row) => row.bucket === "fyi"),
  };
}

export function monthlyDigest(data: DevelopmentData, family: Family) {
  const month = CLUB_DAY_ISO.slice(0, 7);
  const athletes = data.athletes.filter((row) => family.athleteIds.includes(row.id));
  const sessions = data.lessons.filter((row) => family.athleteIds.includes(row.athleteId) && row.date.startsWith(month));
  const completed = data.bookings.filter(
    (row) => family.athleteIds.includes(row.athleteId) && row.date.startsWith(month) && (row.status === "completed" || row.status === "paid"),
  );
  const moved = athletes.map((athlete) => {
    const velo = data.velocity.filter((row) => row.athleteId === athlete.id).sort((a, b) => a.date.localeCompare(b.date));
    const tci = data.bullpens.filter((row) => row.athleteId === athlete.id && row.tci != null);
    const vDelta = velo.length >= 2 ? velo[velo.length - 1].mph - velo[0].mph : null;
    const tLast = tci.length ? tci[tci.length - 1].tci : null;
    return {
      name: athlete.firstName,
      velo: velo.length ? velo[velo.length - 1].mph : null,
      veloDelta: vDelta,
      tci: tLast,
    };
  });
  const watched = buildAlerts(data, { role: "parent", familyId: family.id });
  const next = data.bookings
    .filter((row) => family.athleteIds.includes(row.athleteId) && row.date >= CLUB_DAY_ISO && row.status === "paid")
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
  return {
    sessions: sessions.length || completed.filter((row) => row.date < CLUB_DAY_ISO).length,
    moved,
    watched,
    next,
  };
}

export function familyThread(messages: DevelopmentData["messages"], athleteId: string) {
  return messages.filter((row) => row.athleteId === athleteId && row.channel !== "coach");
}

export function coachNotes(messages: DevelopmentData["messages"], athleteId: string) {
  return messages.filter((row) => row.athleteId === athleteId && row.channel === "coach");
}
