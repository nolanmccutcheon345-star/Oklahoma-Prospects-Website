import { canAccessAthlete, type PdScope } from "./access";
import { emptyDevelopment } from "./empty";
import type { Athlete, DevelopmentData, Family, Message } from "./types";
import { PD_POLICY } from "@/lib/pd";

const ATHLETE_ROW_KEYS = [
  "bookings",
  "waitlist",
  "outings",
  "workoutLog",
  "strengthLog",
  "pointsLog",
  "scorecards",
  "evaluations",
  "lessons",
  "filmReviews",
  "certifications",
  "plans",
  "reportCards",
  "velocity",
  "goals",
  "arsenal",
  "pitchDesign",
  "skillPlans",
  "warmups",
  "strengthSets",
  "throwingAssignments",
  "bullpens",
  "workload",
  "armCare",
  "physicalTests",
  "metrics",
  "recruiting",
  "intake",
  "videos",
  "documents",
] as const;

const STAFF_BLIND_ATHLETE_KEYS = ["interventions", "diagnose", "gameIq", "calibration"] as const;

const STAFF_ONLY_KEYS = ["leads", "auditLog", "calibrationScores"] as const;
const COACH_OPS_KEYS = ["coachPayouts", "coachOverrides"] as const;
const CATALOG_KEYS = [
  "coaches",
  "services",
  "packages",
  "memberships",
  "availability",
  "benchmarks",
  "videoStandards",
] as const;

function keepAthlete(scope: PdScope, athleteId: string) {
  return canAccessAthlete(scope, athleteId);
}

function mergeAthleteRows<T extends { athleteId: string }>(
  full: T[],
  incoming: T[],
  scope: PdScope,
): T[] {
  const outside = full.filter((row) => !keepAthlete(scope, row.athleteId));
  const next = incoming.filter((row) => keepAthlete(scope, row.athleteId));
  return [...outside, ...next];
}

function mergeAthletes(full: Athlete[], incoming: Athlete[], scope: PdScope): Athlete[] {
  const outside = full.filter((row) => !keepAthlete(scope, row.id));
  const next = incoming
    .filter((row) => keepAthlete(scope, row.id))
    .map((row) => {
      if (scope.includeCoachNotes) return row;
      const prev = full.find((item) => item.id === row.id);
      return { ...row, notes: prev?.notes ?? row.notes };
    });
  return [...outside, ...next];
}

function mergeFamilies(full: Family[], incoming: Family[], scope: PdScope): Family[] {
  if (scope.familyIds === "all") return incoming;
  const allowed = scope.familyIds;
  const outside = full.filter((row) => !allowed.has(row.id));
  const next = incoming.filter((row) => allowed.has(row.id));
  return [...outside, ...next];
}

function mergeMessages(full: Message[], incoming: Message[], scope: PdScope): Message[] {
  if (scope.includeCoachNotes) return mergeAthleteRows(full, incoming, scope);
  const outside = full.filter((row) => !keepAthlete(scope, row.athleteId));
  const hidden = full.filter(
    (row) => keepAthlete(scope, row.athleteId) && row.channel === "coach",
  );
  const visible = incoming.filter(
    (row) => keepAthlete(scope, row.athleteId) && row.channel !== "coach",
  );
  return [...outside, ...hidden, ...visible];
}

function mergeCohorts(full: DevelopmentData["cohorts"], incoming: DevelopmentData["cohorts"], scope: PdScope) {
  if (scope.athleteIds === "all") return incoming;
  const kept = full
    .map((row) => {
      const next = incoming.find((item) => item.id === row.id);
      const outside = row.athleteIds.filter((id) => !keepAthlete(scope, id));
      if (!next) {
        return outside.length ? { ...row, athleteIds: outside } : null;
      }
      const inside = next.athleteIds.filter((id) => keepAthlete(scope, id));
      return { ...next, athleteIds: [...outside, ...inside] };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const added = incoming.filter((row) => !full.some((item) => item.id === row.id));
  return [...kept, ...added];
}

function takeIf<T>(allowed: boolean, incoming: T, fallback: T) {
  return allowed ? incoming : fallback;
}

/** Fill keys a stored file is missing. Never re-seeds arrays the staff already emptied. */
export function hydrateWorkingFile(
  parsed: Partial<DevelopmentData> | null | undefined,
  seed: DevelopmentData,
): DevelopmentData {
  const base = emptyDevelopment();
  const out = { ...base, ...seed, ...(parsed ?? {}) } as DevelopmentData;
  (Object.keys(base) as (keyof DevelopmentData)[]).forEach((key) => {
    if (out[key] == null) {
      (out as Record<string, unknown>)[key] = seed[key] ?? base[key];
    }
  });
  out.policy = {
    ...out.policy,
    freeCancelHours: PD_POLICY.freeCancelHours,
    partialRefundHours: PD_POLICY.partialRefundHours,
    lateCancelFeePct: PD_POLICY.lateCancelFeePct,
    noShowFeePct: PD_POLICY.noShowFeePct,
    newFamilyCredit: 0,
  };
  return out;
}

/**
 * Apply a viewer's scoped desk onto the club file.
 * Out-of-scope athletes and staff-only rows the viewer cannot see stay put.
 */
export function mergeScopedFile(
  full: DevelopmentData,
  incoming: DevelopmentData,
  scope: PdScope,
): DevelopmentData {
  const next: DevelopmentData = { ...full };

  next.athletes = mergeAthletes(full.athletes, incoming.athletes, scope);
  next.families = mergeFamilies(full.families, incoming.families, scope);
  next.messages = mergeMessages(full.messages, incoming.messages, scope);
  next.cohorts = mergeCohorts(full.cohorts, incoming.cohorts, scope);

  const patch = next as unknown as Record<string, unknown>;

  for (const key of ATHLETE_ROW_KEYS) {
    patch[key] = mergeAthleteRows(
      full[key] as { athleteId: string }[],
      incoming[key] as { athleteId: string }[],
      scope,
    );
  }

  for (const key of STAFF_BLIND_ATHLETE_KEYS) {
    if (scope.includeCoachNotes) {
      patch[key] = mergeAthleteRows(
        full[key] as { athleteId: string }[],
        incoming[key] as { athleteId: string }[],
        scope,
      );
    }
  }

  for (const key of STAFF_ONLY_KEYS) {
    patch[key] = takeIf(scope.includeStaffOps, incoming[key], full[key]);
  }
  for (const key of COACH_OPS_KEYS) {
    patch[key] = takeIf(scope.includeCoachOps, incoming[key], full[key]);
  }
  for (const key of CATALOG_KEYS) {
    patch[key] = takeIf(scope.includeStaffOps, incoming[key], full[key]);
  }
  next.policy = takeIf(scope.includeStaffOps, incoming.policy, full.policy);

  return next;
}

export function newFileId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
