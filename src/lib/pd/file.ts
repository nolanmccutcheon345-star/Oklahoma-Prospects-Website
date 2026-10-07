import { authorizeMessage, canAccessAthlete, canCoachAthlete, coachingScope, filterDevelopmentData, type PdScope } from "./access";
import { emptyDevelopment } from "./empty";
import type { Athlete, DevelopmentData, Family, Message } from "./types";
import { validDate, chicagoDate } from "../scheduling";
import { THROWING_PLANS } from "./content/throwing";
import { COURSES, moduleId } from "./content/education";
import { scorePitch, tciOf } from "./core-algorithms.js";
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
  "throwingDays",
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

function mergeAthleteRows<T extends { athleteId: string; id?: string }>(
  full: T[],
  incoming: T[],
  scope: PdScope,
): T[] {
  const outside = full.filter((row) => !keepAthlete(scope, row.athleteId));
  const next = incoming.filter((row) => keepAthlete(scope, row.athleteId));
  const owners = new Map(full.map(row => [row.id, row.athleteId]));
  const ids = new Set<string>();
  for (const row of next) {
    // Intake and recruiting profiles are keyed by athlete, not a row ID.
    if (!("id" in row)) continue;
    if (!row.id?.trim() || row.id.length > 150 || ids.has(row.id)) throw new Error("Athlete row identifiers must be nonempty and unique.");
    if (owners.has(row.id) && owners.get(row.id) !== row.athleteId) throw new Error("Athlete row identifier belongs to another athlete.");
    ids.add(row.id);
  }
  return [...outside, ...next];
}

function mergeAthletes(full: Athlete[], incoming: Athlete[], scope: PdScope): Athlete[] {
  // Player identity, eligibility and household records belong to parents/staff.
  if (scope.role === "player") return full;
  return full.map(prev => {
    const row = incoming.find(item => item.id === prev.id);
    if (!row || !keepAthlete(scope, prev.id)) return prev;
    if (row.birthDate && (!validDate(row.birthDate) || row.birthDate > chicagoDate())) throw new Error("Choose a valid athlete date of birth.");
    if (row.sport && !["baseball", "softball"].includes(row.sport)) throw new Error("Choose baseball or softball.");
    if (typeof row.position !== "string" || row.position.length > 80) throw new Error("Invalid athlete position.");
    const personal = { firstName: row.firstName, lastName: row.lastName, school: row.school,
      city: row.city, birthDate: row.birthDate, graduationYear: row.graduationYear,
      sport: row.sport, position: row.position, throws: row.throws, bats: row.bats, frame: row.frame };
    const coached = canCoachAthlete(scope, prev.id) ? { ...prev, ...row } : { ...prev, ...personal };
    // Payment and completion are controlled by dedicated server commands, even for staff.
    return { ...coached, id: prev.id, familyId: prev.familyId,
      coachIds: scope.includeStaffOps ? row.coachIds : prev.coachIds,
      assessmentComplete: prev.assessmentComplete };
  });
}

function mergeFamilies(full: Family[], incoming: Family[], scope: PdScope): Family[] {
  if (scope.role === "player") return full;
  return full.map(prev => {
    const row = incoming.find(item => item.id === prev.id);
    const allowed = scope.familyIds === "all" || scope.familyIds.has(prev.id);
    return row && allowed ? { ...prev, name: row.name, parentName: row.parentName,
      phone: row.phone, leaderboardOptOut: row.leaderboardOptOut } : prev;
  });
}

function mergeMessages(full:Message[],incoming:Message[],scope:PdScope):Message[] {
 if (scope.role === "player") return full;
 const existing=new Set(full.map(row=>row.id));
 const additions=incoming.filter(row=>!existing.has(row.id)&&keepAthlete(scope,row.athleteId)&&(canCoachAthlete(scope,row.athleteId)||row.channel!=='coach'))
  .map(row=>({...row,...authorizeMessage(scope,row)}));
 if(new Set(additions.map(row=>row.id)).size!==additions.length)throw new Error("New message identifiers must be unique.");
 return [...full,...additions];
}

function mergeCohorts(full: DevelopmentData["cohorts"], incoming: DevelopmentData["cohorts"], scope: PdScope) {
  if (scope.athleteIds === "all") return incoming;
  if (incoming.some(row => row.athleteIds.some(id => !keepAthlete(scope,id)))) throw new Error("A cohort can include only your assigned athletes.");
  const kept = full
    .map((row) => {
      const next = incoming.find((item) => item.id === row.id);
      const outside = row.athleteIds.filter((id) => !keepAthlete(scope, id));
      if (!next) {
        return outside.length ? { ...row, athleteIds: outside } : null;
      }
      const inside = next.athleteIds.filter((id) => keepAthlete(scope, id));
      return { ...(outside.length ? row : next), athleteIds: [...outside, ...inside] };
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
  // Older open clients cannot erase fields introduced after they loaded.
  incoming = hydrateWorkingFile(incoming, filterDevelopmentData(full, scope));
  const next: DevelopmentData = { ...full };

  next.athletes = mergeAthletes(full.athletes, incoming.athletes, scope);
  next.families = mergeFamilies(full.families, incoming.families, scope);
  next.messages = mergeMessages(full.messages, incoming.messages, scope);
  if (scope.includeCoachNotes) next.cohorts = mergeCohorts(full.cohorts, incoming.cohorts, coachingScope(scope));

  const patch = next as unknown as Record<string, unknown>;

  const familyWritable = new Set<string>(["outings", "workoutLog", "strengthLog", "strengthSets", "throwingDays", "workload", "goals", "armCare", "intake", "videos"]);
  for (const key of ATHLETE_ROW_KEYS) {
    if (key === "bookings" || key === "throwingAssignments") continue;
    patch[key] = mergeAthleteRows(
      full[key] as { athleteId: string }[],
      incoming[key] as { athleteId: string }[],
      familyWritable.has(key) ? scope : coachingScope(scope),
    );
  }

  for (const key of STAFF_BLIND_ATHLETE_KEYS) {
    if (scope.includeCoachNotes) {
      patch[key] = mergeAthleteRows(
        full[key] as { athleteId: string }[],
        incoming[key] as { athleteId: string }[],
        coachingScope(scope),
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
  // Prescriptions are append-only. A replacement creates a new version, never rewrites history.
  for (const key of ["strengthAssignments", "throwingAssignments"] as const) {
    const previous = full[key] ?? [];
    const ids = new Set(previous.map(row => row.id));
    const additions = (incoming[key] ?? []).filter(row => !ids.has(row.id) && canCoachAthlete(scope, row.athleteId))
      .map(row => ({ ...row, createdAt: new Date().toISOString(), createdBy: scope.viewerEmail ?? "" }));
    if (new Set(additions.map(row => row.id)).size !== additions.length) throw new Error("Prescription version identifiers must be unique.");
    if (key === "strengthAssignments") {
      for (const raw of additions) {
        const row = raw as DevelopmentData["strengthAssignments"][number];
        const athlete = next.athletes.find(a => a.id === row.athleteId);
        if (!row.program || !Array.isArray(row.program.slots) || !["draft", "published"].includes(row.status)) throw new Error("Invalid strength program version.");
        if (row.status === "published" && (!athlete?.assessmentComplete || !athlete.birthDate || !athlete.sport || !athlete.position || !row.program.slots.length)) throw new Error("Complete the athlete profile and assessment before publishing a program.");
      }
    }
    if (key === "throwingAssignments" && additions.some(row => !("templateId" in row) || !THROWING_PLANS.some(p => p.id === row.templateId && p.days.some(d => d.type === row.dayType)))) {
      throw new Error("Choose a valid throwing template and day.");
    }
    (next as unknown as Record<string, unknown>)[key] = [...additions, ...previous];
  }
  next.throwingDays = next.throwingDays.filter(row => {
    const assignment = next.throwingAssignments.find(a => a.id === row.assignmentId && a.athleteId === row.athleteId);
    const plan = THROWING_PLANS.find(p => p.id === assignment?.templateId);
    return Boolean(plan?.days.some(day => day.type === row.dayType));
  });
  // Derive displayed counts and scores from the saved chart, not client totals.
  next.bullpens = next.bullpens.map(row => {
    if (!canCoachAthlete(scope, row.athleteId) || !row.chart) return row;
    const chart = row.chart.map(pitch => {
      for (const cell of [pitch.intent, pitch.actual]) {
        if (![cell.row, cell.col].every(n => Number.isInteger(n) && n >= 0 && n <= 4)) throw new Error("Invalid pitch location.");
      }
      return { ...pitch, score: scorePitch(pitch.intent, pitch.actual) };
    });
    return { ...row, chart, pitches: Math.max(row.pitches, chart.length), tci: tciOf(chart) };
  });
  const email = scope.viewerEmail;
  if (email) {
    const known = new Set(COURSES.flatMap(c => c.modules.map((_, i) => moduleId(c.id, i))));
    next.educationProgress = { ...full.educationProgress,
      [email]: [...new Set((incoming.educationProgress?.[email] ?? full.educationProgress?.[email] ?? []).filter(id => known.has(id)))] };
  }
  next.policy = takeIf(scope.includeStaffOps, incoming.policy, full.policy);

  return next;
}

export function newFileId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
