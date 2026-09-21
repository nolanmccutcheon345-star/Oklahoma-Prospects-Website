export type RoleType = "full" | "po";

export type Settings = {
  contingencyPct: number;
  membershipMonthly: number;
  facilityMonthly: number;
  fundingPlayers: number;
  cardFeePct: number;
  orgFeeFloor: number;
  orgFeeCeiling: number;
  coachPayMin: number;
  coachPayMax: number;
  cageHourly: number;
  roundTo: number;
  policyVersion: string;
};

export type UniformPackage = {
  id: string;
  name: string;
  sport: "baseball" | "softball";
  price: number;
  items: string[];
  colourways: string[];
  sizeFields: string[];
};

export type StaffMember = {
  id: string;
  name: string;
  role: string;
  monthly: number;
  childId: string;
  applyAmount: number;
  w9: boolean;
  backgroundCheck: boolean;
  safeSport: boolean;
  expires: string;
  email: string;
};

export type PlayerDoc = {
  waiver: boolean;
  birthCert: boolean;
  insurance: boolean;
  physical: boolean;
};

export type Player = {
  id: string;
  teamId: string;
  familyId: string;
  name: string;
  number: string;
  positions: string[];
  bats: string;
  throws: string;
  gradYear: string;
  school: string;
  height: string;
  weight: string;
  email: string;
  parents: { name: string; rel: string; phone: string; email: string }[];
  roleType: RoleType;
  coachChild: boolean;
  joinedOn: string;
  withdrawn: boolean;
  agreement: { version: string; signedBy: string; signedAt: string };
  feeLock: {
    amount: number;
    lockedAt: string;
    policyVersion: string;
    components: Record<string, number>;
  } | null;
  planLock: {
    dep: number;
    deadline: string;
    planType: string;
    rows: { date: string; amount: number }[];
  } | null;
  credits: { label: string; amount: number }[];
  payments: {
    date: string;
    amount: number;
    fee: number;
    charged: number;
    method: string;
    label: string;
    receipt: string;
  }[];
  cards: { brand: string; last4: string; exp: string; primary: boolean }[];
  planType: string;
  depositPaid: boolean;
  uniformWaived: boolean;
  order: { number: string; sizes: Record<string, string>; submitted: boolean };
  docs: PlayerDoc;
  emergency: {
    allergies: string;
    conditions: string;
    insurer: string;
    policyNo: string;
    physician: string;
    pickup: string[];
    notes: string;
  };
  publicProfile: { enabled: boolean; bio: string; slug: string };
  prefs: { email: boolean; sms: boolean };
  reenroll: boolean;
  cageOverage: number;
  stats: Record<string, number>;
  rsvp: Record<string, "going" | "maybe" | "cant" | "">;
};

export type EventItem = {
  id: string;
  org: string;
  name: string;
  city: string;
  state: string;
  start: string;
  end: string;
  ages: string[];
  levels: string[];
  fee: number;
  sport: string;
  type: "tournament" | "showcase";
  stayToPlay: boolean;
  verifiedOn: string;
};

export type Practice = {
  id: string;
  date: string;
  time: string;
  where: string;
  cageHours: number;
  status: "set" | "delayed" | "moved" | "cancelled" | "on";
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  pin: boolean;
  arrive: string;
  uniform: string;
  hotel: string;
};

export type Message = {
  id: string;
  at: string;
  from: string;
  body: string;
};

export type PitchOuting = {
  id: string;
  playerId: string;
  date: string;
  pitches: number;
};

export type Team = {
  id: string;
  name: string;
  sport: "baseball" | "softball";
  age: string;
  level: string;
  seasonLabel: string;
  seasonStart: string;
  seasonEnd: string;
  months: number;
  headCoach: string;
  coachEmail: string;
  staff: StaffMember[];
  uniformPackageId: string;
  uniformDeadline: string;
  orgFee: number;
  coachMonthly: number;
  eventBudget: number;
  tournamentIds: string[];
  otherCosts: {
    insurance: number;
    balls: number;
    fields: number;
    admin: number;
    travel: number;
  };
  teamCageHoursPerWeek: number;
  playerCageHoursPerWeek: number;
  record: { w: number; l: number; t: number };
  roster: Player[];
  practices: Practice[];
  messages: Message[];
  announcements: Announcement[];
  attendance: Record<string, Record<string, "present" | "late" | "excused" | "absent">>;
  pitchLog: PitchOuting[];
  closed: boolean;
  notes: string;
};

export type Lead = {
  id: string;
  name: string;
  age: string;
  stage: "lead" | "registered" | "evaluated" | "offer" | "accepted" | "waitlist";
  grades: Record<string, number>;
  teamId: string;
};

export type Alumni = {
  id: string;
  name: string;
  kind: "college" | "draft" | "pro";
  detail: string;
};

export type Notification = {
  id: string;
  ts: string;
  teamId: string;
  kind: string;
  title: string;
  body: string;
  audience: "admin" | "coach" | "family" | "all";
};

export type ClubRecord = {
  settings: Settings;
  teams: Team[];
  catalog: EventItem[];
  uniforms: UniformPackage[];
  leads: Lead[];
  alumni: Alumni[];
  notifications: Notification[];
  audit: { at: string; action: string; detail: string }[];
  onboarding: { started: boolean };
  _rev: number;
  _savedAt: string;
  _demo: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  contingencyPct: 0.15,
  membershipMonthly: 200,
  facilityMonthly: 500,
  fundingPlayers: 10,
  cardFeePct: 0,
  orgFeeFloor: 300,
  orgFeeCeiling: 750,
  coachPayMin: 1250,
  coachPayMax: 2000,
  cageHourly: 45,
  roundTo: 25,
  policyVersion: "2026-spring-1",
};
