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
  return full.map(prev => {
    const row = incoming.find(item => item.id === prev.id);
    if (!row || !keepAthlete(scope, prev.id)) return prev;
    const personal = { firstName: row.firstName, lastName: row.lastName, school: row.school,
      city: row.city, birthDate: row.birthDate, graduationYear: row.graduationYear,
      sport: row.sport, position: row.position, throws: row.throws, bats: row.bats, frame: row.frame };
    const coached = scope.includeCoachNotes ? { ...prev, ...row } : { ...prev, ...personal };
    // Payment and completion are controlled by dedicated server commands, even for staff.
    return { ...coached, id: prev.id, familyId: prev.familyId,
      coachIds: scope.includeStaffOps ? row.coachIds : prev.coachIds,
      assessmentComplete: prev.assessmentComplete };
  });
}

function mergeFamilies(full: Family[], incoming: Family[], scope: PdScope): Family[] {
  return full.map(prev => {
    const row = incoming.find(item => item.id === prev.id);
    const allowed = scope.familyIds === "all" || scope.familyIds.has(prev.id);
    return row && allowed ? { ...prev, name: row.name, parentName: row.parentName,
      phone: row.phone, leaderboardOptOut: row.leaderboardOptOut } : prev;
  });
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
  if (added.some(row => row.athleteIds.some(id => !keepAthlete(scope,id)))) {
    throw new Error('A cohort can include only your assigned athletes.');
  }
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
  if (scope.includeCoachNotes) next.cohorts = mergeCohorts(full.cohorts, incoming.cohorts, scope);

  const patch = next as unknown as Record<string, unknown>;

  const familyWritable = new Set<string>(["outings", "workoutLog", "strengthLog", "strengthSets", "workload", "goals", "armCare", "intake", "videos"]);
  for (const key of ATHLETE_ROW_KEYS) {
    if (key === "bookings" || (!scope.includeCoachNotes && !familyWritable.has(key))) continue;
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
    patch[key] = key === "auditLog" ? full[key] : takeIf(scope.includeStaffOps, incoming[key], full[key]);
  }
  for (const key of COACH_OPS_KEYS) {
    patch[key] = takeIf(scope.includeStaffOps, incoming[key], full[key]);
  }
  for (const key of CATALOG_KEYS) {
    patch[key] = takeIf(scope.includeStaffOps, incoming[key], full[key]);
  }
  if (scope.role === "coach" && scope.coachId) {
    next.availability = [...full.availability.filter(row => row.coachId !== scope.coachId),
      ...incoming.availability.filter(row => row.coachId === scope.coachId)];
    next.coaches = full.coaches.map(row => row.id === scope.coachId
      ? { ...row, ...incoming.coaches.find(item => item.id === row.id), id: row.id, email: row.email, active: row.active }
      : row);
  }
  next.policy = takeIf(scope.includeStaffOps, incoming.policy, full.policy);

  return next;
}

export function newFileId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
