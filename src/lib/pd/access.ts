import type { DevelopmentData, ViewerRole } from "./types";

export type PdViewer = {
  canInstruct?: boolean;
  playerIds?: string[];
  role: ViewerRole;
  email: string;
  householdEmails?: string[];
  name: string;
  playerName: string;
};

export type PdScope = {
  role: ViewerRole;
  coachId?: string;
  viewerEmail?: string;
  coachingAthleteIds?: "all" | Set<string>;
  athleteIds: "all" | Set<string>;
  familyIds: "all" | Set<string>;
  householdFamilyIds?: Set<string>;
  includeCoachNotes: boolean;
  includeStaffOps: boolean;
  includeCoachOps: boolean;
};

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function resolveViewerRole(email: string, profileRole?: string | null): ViewerRole {
  // Email alone does not grant a role. The server resolves verified grants.
  void email;
  if (profileRole === "admin") return "admin";
  if (profileRole === "coach") return "coach";
  if (profileRole === "player") return "player";
  return "parent";
}

export function familyForViewer(viewer: PdViewer, data: DevelopmentData) {
  const email = viewer.email.trim().toLowerCase();
  if (email) {
    const byEmail = data.families.find(
      (row) =>
        row.email.trim().toLowerCase() === email ||
        viewer.householdEmails?.includes(row.email.trim().toLowerCase()),
    );
    if (byEmail) return byEmail;
  }
  return undefined;
}

export function athleteForPlayer(viewer: PdViewer, data: DevelopmentData) {
  const linked=data.athletes.find(a=>viewer.playerIds?.includes(a.id));
  if(linked)return linked;
  const family = familyForViewer(viewer, data);
  if (!family) return undefined;
  const kids = data.athletes.filter((row) => family.athleteIds.includes(row.id));
  const needle = viewer.playerName.trim().toLowerCase();
  if (needle) {
    return kids.find((row) => `${row.firstName} ${row.lastName}`.toLowerCase() === needle);
  }
  return kids.length === 1 ? kids[0] : undefined;
}

export function scopeForViewer(viewer: PdViewer, data: DevelopmentData): PdScope {
  if (viewer.role === "admin") {
    return {
      role: "admin",
      viewerEmail: viewer.email.trim().toLowerCase(),
      coachingAthleteIds: "all",
      athleteIds: "all",
      familyIds: "all",
      includeCoachNotes: true,
      includeStaffOps: true,
      includeCoachOps: true,
    };
  }
  if (viewer.role === "coach" || viewer.canInstruct) {
    const me = data.coaches.find(
      (row) =>
        row.active !== false &&
        row.email.trim().toLowerCase() === viewer.email.trim().toLowerCase(),
    );
    // Only verified ledger bookings (overlaid by the server) grant booking-derived access.
    // Cancellation removes this grant; explicit owner assignments remain independent.
    const booked = new Set(
      data.bookings
        .filter(
          (b) => me && b.coachId === me.id && (b.status === "paid" || b.status === "completed"),
        )
        .map((b) => b.athleteId),
    );
    const coachingAthleteIds = new Set(
      data.athletes
        .filter((a) => me && (a.coachIds.includes(me.id) || booked.has(a.id)))
        .map((a) => a.id),
    );
    const emails = new Set([viewer.email.trim().toLowerCase(), ...(viewer.householdEmails || [])]);
    const householdIds = data.families
      .filter((f) => emails.has(f.email.trim().toLowerCase()))
      .flatMap((f) => f.athleteIds);
    const ownIds=viewer.role==='player' ? [...(viewer.playerIds||[]),...householdIds.filter(id=>data.families.some(f=>viewer.householdEmails?.includes(f.email.trim().toLowerCase())&&f.athleteIds.includes(id))),...(athleteForPlayer(viewer,data)?[athleteForPlayer(viewer,data)!.id]:[])] : [...householdIds,...(viewer.playerIds||[])];
    const ids = new Set([...coachingAthleteIds, ...ownIds]);
    const familyIds = new Set(
      data.athletes.filter((row) => ids.has(row.id)).map((row) => row.familyId),
    );
    return {
      role: "coach",
      coachId: me?.id,
      viewerEmail: viewer.email.trim().toLowerCase(),
      coachingAthleteIds,
      householdFamilyIds: new Set(data.families.filter(f=>emails.has(f.email.trim().toLowerCase())).map(f=>f.id)),
      athleteIds: ids,
      familyIds,
      includeCoachNotes: true,
      includeStaffOps: false,
      includeCoachOps: true,
    };
  }
  if (viewer.role === "player") {
    const self = athleteForPlayer(viewer, data);
    const ids = new Set([...(self ? [self.id] : []),...(viewer.playerIds||[])]);
    const familyIds = new Set(data.athletes.filter(a=>ids.has(a.id)).map(a=>a.familyId));
    return {
      role: "player",
      viewerEmail: viewer.email.trim().toLowerCase(),
      coachingAthleteIds: new Set(),
      athleteIds: ids,
      familyIds,
      includeCoachNotes: false,
      includeStaffOps: false,
      includeCoachOps: false,
    };
  }
  const emails = new Set([viewer.email.trim().toLowerCase(), ...(viewer.householdEmails || [])]);
  const families = data.families.filter((f) => emails.has(f.email.trim().toLowerCase()));
  const ids = new Set([...families.flatMap((f) => f.athleteIds),...(viewer.playerIds||[])]);
  const familyIds = new Set(families.map((f) => f.id));
  return {
    role: "parent",
    viewerEmail: viewer.email.trim().toLowerCase(),
    coachingAthleteIds: new Set(),
    athleteIds: ids,
    familyIds,
    includeCoachNotes: false,
    includeStaffOps: false,
    includeCoachOps: false,
  };
}

export function canCoachAthlete(scope: PdScope, athleteId: string) {
  return (
    scope.includeCoachNotes &&
    (scope.coachingAthleteIds === "all" ||
      (scope.coachingAthleteIds
        ? scope.coachingAthleteIds.has(athleteId)
        : canAccessAthlete(scope, athleteId)))
  );
}

export function coachingScope(scope: PdScope): PdScope {
  return {
    ...scope,
    athleteIds:
      scope.coachingAthleteIds ?? (scope.includeCoachNotes ? scope.athleteIds : new Set()),
  };
}

export function canAccessAthlete(scope: PdScope, athleteId: string) {
  if (!athleteId) return false;
  if (scope.athleteIds === "all") return true;
  return scope.athleteIds.has(athleteId);
}

export function assertAthleteAccess(scope: PdScope, athleteId: string) {
  if (!canAccessAthlete(scope, athleteId)) throw new ForbiddenError();
}

function keepId(scope: PdScope, id: string) {
  return scope.athleteIds === "all" || scope.athleteIds.has(id);
}

function ofAthlete<T extends { athleteId: string }>(rows: T[], scope: PdScope) {
  return rows.filter((row) => keepId(scope, row.athleteId));
}

export function filterDevelopmentData(data: DevelopmentData, scope: PdScope): DevelopmentData {
  const athletes = data.athletes
    .filter((row) => keepId(scope, row.id))
    .map((row) => (canCoachAthlete(scope, row.id) ? row : { ...row, notes: "" }));
  const familyIds = scope.familyIds;
  const families = (familyIds === "all" ? data.families : data.families.filter((row) => familyIds.has(row.id)))
    .map(row=>scope.includeStaffOps ? row : {...row,athleteIds:row.athleteIds.filter(id=>keepId(scope,id)),
      ...(scope.role==='coach'&&!scope.householdFamilyIds?.has(row.id)?{plan:undefined}:{})});

  let messages = ofAthlete(data.messages, scope);
  messages = messages.filter(
    (row) => row.channel !== "coach" || canCoachAthlete(scope, row.athleteId),
  );

  const staff = scope.includeStaffOps;
  const coachOps = scope.includeCoachOps;
  const player = scope.role === "player";
  // Players need their appointment schedule, not the household's purchase record.
  const bookings = ofAthlete(data.bookings, scope).map((row) =>
    player
      ? {
          id: row.id,
          athleteId: row.athleteId,
          serviceId: row.serviceId,
          date: row.date,
          time: row.time,
          status: row.status,
          coachId: row.coachId,
          dateLabel: row.dateLabel,
          price: 0,
        }
      : row,
  );
  const playerFamilies = families.map((row) => ({
    id: row.id,
    name: row.name,
    parentName: "",
    email: scope.viewerEmail || "",
    phone: "",
    athleteIds: row.athleteIds.filter((id) => keepId(scope, id)),
    leaderboardOptOut: row.leaderboardOptOut,
    plan: row.plan ? { type: "none" as const, lessonCredits: 0 } : undefined,
  }));

  return {
    ...data,
    athletes,
    coaches: staff ? data.coaches : data.coaches.map(({id,name,email,specialties,active}) => ({
      id, name, email: scope.includeCoachOps && email.trim().toLowerCase() === scope.viewerEmail ? email : "", specialties, active,
    })),
    families: player ? playerFamilies : families,
    services: player
      ? data.services.map(({ id, name, kind, minutes }) => ({ id, name, kind, minutes, price: 0 }))
      : data.services,
    packages: player ? [] : data.packages,
    memberships: player ? [] : data.memberships,
    policy: player ? { ...data.policy, newFamilyCredit: 0 } : data.policy,
    educationProgress: scope.viewerEmail
      ? { [scope.viewerEmail]: data.educationProgress?.[scope.viewerEmail] ?? [] }
      : {},
    strengthAssignments: ofAthlete(data.strengthAssignments ?? [], scope).filter(
      (row) => row.status === "published" || canCoachAthlete(scope, row.athleteId),
    ),
    throwingDays: ofAthlete(data.throwingDays ?? [], scope),
    bookings,
    waitlist: player ? [] : ofAthlete(data.waitlist, scope),
    leads: staff ? data.leads : [],
    outings: ofAthlete(data.outings, scope),
    workoutLog: ofAthlete(data.workoutLog, scope),
    strengthLog: ofAthlete(data.strengthLog, scope),
    pointsLog: ofAthlete(data.pointsLog, scope),
    scorecards: ofAthlete(data.scorecards, scope),
    evaluations: ofAthlete(data.evaluations, scope),
    lessons: ofAthlete(data.lessons, scope),
    filmReviews: ofAthlete(data.filmReviews, scope),
    interventions: ofAthlete(data.interventions, coachingScope(scope)),
    calibration: ofAthlete(data.calibration, coachingScope(scope)),
    calibrationScores: staff ? data.calibrationScores : [],
    coachPayouts: staff
      ? data.coachPayouts
      : coachOps
        ? data.coachPayouts.filter((row) => row.coachId === scope.coachId)
        : [],
    coachOverrides: staff ? data.coachOverrides : [],
    certifications: ofAthlete(data.certifications, scope),
    auditLog: staff ? data.auditLog : [],
    messages,
    plans: ofAthlete(data.plans, scope),
    diagnose: ofAthlete(data.diagnose, coachingScope(scope)),
    cohorts: data.cohorts
      .map((row) => ({
        ...row,
        athleteIds: row.athleteIds.filter((id) =>
          keepId(scope.includeCoachNotes ? coachingScope(scope) : scope, id),
        ),
      }))
      .filter((row) => row.athleteIds.length > 0),
    gameIq: ofAthlete(data.gameIq, coachingScope(scope)),
    reportCards: ofAthlete(data.reportCards, scope),
    velocity: ofAthlete(data.velocity, scope),
    goals: ofAthlete(data.goals, scope),
    arsenal: ofAthlete(data.arsenal, scope),
    pitchDesign: ofAthlete(data.pitchDesign, scope),
    skillPlans: ofAthlete(data.skillPlans, scope),
    warmups: ofAthlete(data.warmups, scope),
    strengthSets: ofAthlete(data.strengthSets, scope),
    throwingAssignments: ofAthlete(data.throwingAssignments, scope),
    bullpens: ofAthlete(data.bullpens, scope),
    workload: ofAthlete(data.workload, scope),
    armCare: ofAthlete(data.armCare, scope),
    physicalTests: ofAthlete(data.physicalTests, scope),
    metrics: ofAthlete(data.metrics, scope),
    recruiting: ofAthlete(data.recruiting, scope),
    intake: ofAthlete(data.intake, scope),
    videos: ofAthlete(data.videos, scope),
    documents: ofAthlete(data.documents, scope),
  };
}

export function authorizeMessage(
  scope: PdScope,
  input: { athleteId: string; body: string; channel?: "family" | "coach" },
) {
  assertAthleteAccess(scope, input.athleteId);
  const body = input.body.trim();
  if (!body) throw new ForbiddenError();
  if (scope.role === "player") throw new ForbiddenError();
  const channel: "coach" | "family" = input.channel === "coach" ? "coach" : "family";
  if (channel === "coach" && !canCoachAthlete(scope, input.athleteId)) throw new ForbiddenError();
  return { athleteId: input.athleteId, body: body.slice(0, 4000), channel };
}
