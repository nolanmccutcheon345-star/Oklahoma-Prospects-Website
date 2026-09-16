import type { DevelopmentData, ViewerRole } from "./types";

export type PdViewer = {
  role: ViewerRole;
  email: string;
  householdEmails?: string[];
  name: string;
  playerName: string;
};

export type PdScope = {
  role: ViewerRole;
  coachId?: string;
  athleteIds: "all" | Set<string>;
  familyIds: "all" | Set<string>;
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
    const byEmail = data.families.find((row) => row.email.trim().toLowerCase() === email || viewer.householdEmails?.includes(row.email.trim().toLowerCase()));
    if (byEmail) return byEmail;
  }
  return undefined;
}

export function athleteForPlayer(viewer: PdViewer, data: DevelopmentData) {
  const family = familyForViewer(viewer, data);
  if (!family) return undefined;
  const kids = data.athletes.filter((row) => family.athleteIds.includes(row.id));
  const needle = viewer.playerName.trim().toLowerCase();
  if (needle) {
    return kids.find(
      (row) => `${row.firstName} ${row.lastName}`.toLowerCase() === needle,
    );
  }
  return kids.length === 1 ? kids[0] : undefined;
}

export function scopeForViewer(viewer: PdViewer, data: DevelopmentData): PdScope {
  if (viewer.role === "admin") {
    return {
      role: "admin",
      athleteIds: "all",
      familyIds: "all",
      includeCoachNotes: true,
      includeStaffOps: true,
      includeCoachOps: true,
    };
  }
  if (viewer.role === "coach") {
    const me = data.coaches.find(
      (row) => row.email.trim().toLowerCase() === viewer.email.trim().toLowerCase(),
    );
    const ids = me
      ? new Set(data.athletes.filter((row) => row.coachIds.includes(me.id)).map((row) => row.id))
      : new Set<string>();
    const familyIds = new Set(
      data.athletes.filter((row) => ids.has(row.id)).map((row) => row.familyId),
    );
    return {
      role: "coach",
      coachId: me?.id,
      athleteIds: ids,
      familyIds,
      includeCoachNotes: true,
      includeStaffOps: false,
      includeCoachOps: true,
    };
  }
  if (viewer.role === "player") {
    const self = athleteForPlayer(viewer, data);
    const ids = new Set(self ? [self.id] : []);
    const familyIds = new Set(self ? [self.familyId] : []);
    return {
      role: "player",
      athleteIds: ids,
      familyIds,
      includeCoachNotes: false,
      includeStaffOps: false,
      includeCoachOps: false,
    };
  }
  const emails=new Set([viewer.email.trim().toLowerCase(),...(viewer.householdEmails||[])]);
  const families=data.families.filter(f=>emails.has(f.email.trim().toLowerCase()));
  const ids = new Set(families.flatMap(f=>f.athleteIds));
  const familyIds = new Set(families.map(f=>f.id));
  return {
    role: "parent",
    athleteIds: ids,
    familyIds,
    includeCoachNotes: false,
    includeStaffOps: false,
    includeCoachOps: false,
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
    .map((row) =>
      scope.includeCoachNotes
        ? row
        : { ...row, notes: "" },
    );
  const familyIds = scope.familyIds;
  const families =
    familyIds === "all" ? data.families : data.families.filter((row) => familyIds.has(row.id));

  let messages = ofAthlete(data.messages, scope);
  if (!scope.includeCoachNotes) {
    messages = messages.filter((row) => row.channel !== "coach");
  }

  const staff = scope.includeStaffOps;
  const coachOps = scope.includeCoachOps;

  return {
    ...data,
    athletes,
    families,
    bookings: ofAthlete(data.bookings, scope),
    waitlist: ofAthlete(data.waitlist, scope),
    leads: staff ? data.leads : [],
    outings: ofAthlete(data.outings, scope),
    workoutLog: ofAthlete(data.workoutLog, scope),
    strengthLog: ofAthlete(data.strengthLog, scope),
    pointsLog: ofAthlete(data.pointsLog, scope),
    scorecards: ofAthlete(data.scorecards, scope),
    evaluations: ofAthlete(data.evaluations, scope),
    lessons: ofAthlete(data.lessons, scope),
    filmReviews: ofAthlete(data.filmReviews, scope),
    interventions: scope.includeCoachNotes ? ofAthlete(data.interventions, scope) : [],
    calibration: coachOps ? ofAthlete(data.calibration, scope) : [],
    calibrationScores: staff ? data.calibrationScores : [],
    coachPayouts: staff ? data.coachPayouts : coachOps ? data.coachPayouts.filter(row => row.coachId === scope.coachId) : [],
    coachOverrides: staff ? data.coachOverrides : [],
    certifications: ofAthlete(data.certifications, scope),
    auditLog: staff ? data.auditLog : [],
    messages,
    plans: ofAthlete(data.plans, scope),
    diagnose: scope.includeCoachNotes ? ofAthlete(data.diagnose, scope) : [],
    cohorts: data.cohorts
      .map((row) => ({
        ...row,
        athleteIds: row.athleteIds.filter((id) => keepId(scope, id)),
      }))
      .filter((row) => row.athleteIds.length > 0),
    gameIq: scope.includeCoachNotes ? ofAthlete(data.gameIq, scope) : [],
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
  const channel = input.channel === "coach" ? "coach" : "family";
  if (channel === "coach" && !scope.includeCoachNotes) throw new ForbiddenError();
  return { athleteId: input.athleteId, body: body.slice(0, 4000), channel };
}