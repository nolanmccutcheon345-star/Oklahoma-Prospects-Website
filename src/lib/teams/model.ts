export type OsRole = "admin" | "coach" | "parent" | "player";

export type OsPerms = {
  admin: boolean;
  coach: boolean;
  parent: boolean;
  player: boolean;
  seeMargin: boolean;
  seeTeamMoney: boolean;
  seeOwnMoney: boolean;
  seeAnyPrice: boolean;
  seeOtherFamilies: boolean;
};

export type OsIdentity = {
  role: OsRole;
  email: string;
  familyId: string | null;
  playerId: string | null;
  teamId: string | null;
};

export type OsClearance = "cleared" | "unsigned" | "account" | "docs" | "sizes";

export type OsDepositCharge = {
  amount: number;
  fee: number;
  totalCharged: number;
};

export type OsInvite = {
  id: string;
  name: string;
  email: string;
  position: string;
  sent: string;
  status: string;
  charge?: OsDepositCharge | null;
};

export type OsReimbursement = {
  id: string;
  teamId: string;
  staffEmail: string;
  amount: number;
  date: string;
  note: string;
  status: string;
  category?: "travel" | "hotel" | "mileage" | "equipment" | string;
  purpose?: string;
  receipt?: boolean;
  reportable?: boolean;
};

export type OsViewer = {
  role: OsRole;
  publishedByTeam: Record<string, number>;
  entryByTeam: Record<string, { budget: number; spent: number; pct: number }>;
  travelByTeam: Record<string, { budget: number; reimbursed: number }>;
  cageByTeam: Record<string, { teamHours: number; used: number }>;
  eventShareByTeam: Record<string, Record<string, number>>;
  ownPay: { teamId: string; season: number; cash: number; monthly: number } | null;
  ownChild: { teamId: string; playerId: string; name: string; fee: number } | null;
  membershipIncludes: string[];
};

export type OsParent = {
  name: string;
  rel: string;
  phone: string;
  email: string;
};

export type OsPlayer = {
  id: string;
  teamId: string;
  name: string;
  number: number | string;
  positions: string[] | string;
  bats: string;
  throws: string;
  gradYear: number | string;
  school: string;
  height: string;
  weight: number | string;
  email: string;
  parents: OsParent[];
  familyId: string;
  roleType: "full" | "po" | string;
  coachChild: "head" | "assistant" | null;
  joinedOn: string | null;
  withdrawn: string | null;
  credits?: { id?: string; type?: string; amount: number; note?: string; date?: string }[];
  agreement: { version: number | string; signedBy: string; signedAt: string } | null;
  prefs: { email: boolean; sms: boolean };
  feeLock?: {
    amount: number;
    lockedAt: string;
    policyVersion: number | string;
    components: Record<string, number>;
  } | null;
  amendments?: { status: string; delta?: number; note?: string }[];
  planLock?: {
    dep: number;
    deadline: string | null;
    planType: string;
    rows: { label: string; due: string; amount: number }[];
    createdAt: string;
  } | null;
  emergency: {
    allergies: string;
    conditions: string;
    insurer: string;
    policyNo: string;
    physician: string;
    pickup: string[];
    notes: string;
  };
  publicProfile: { enabled: boolean; bio: string; video: unknown[]; slug: string };
  reenroll:
    | {
        seasonLabel: string;
        earlyBird: number;
        deadline: string;
        status: "offer" | "accepted" | "declined";
      }
    | null
    | unknown;
  uniformWaived: boolean;
  docs: Record<string, boolean>;
  order: { number: number | string; sizes: Record<string, string>; submitted: boolean };
  depositPaid: boolean;
  depositCharge?: OsDepositCharge | null;
  planType: string;
  cards?: { id?: string; brand: string; last4: string; exp: string; primary: boolean }[];
  payments?: {
    amount: number;
    date?: string;
    label?: string;
    fee?: number;
    totalCharged?: number;
    method?: "card" | "ach";
    receipt?: string;
  }[];
  cageOverage: number;
  stats: Record<string, number | string | null>;
  draftEnrolled?: boolean;
  failedDraft?: boolean;
};

export type OsStaff = {
  id: string;
  name: string;
  role: string;
  monthly: number;
  childId: string | null;
  applyAmount: number;
  w9: boolean;
  backgroundCheck: string | boolean;
  safeSport: string | boolean;
  expires: string;
  email?: string;
};

export type OsTeam = {
  id: string;
  name: string;
  sport: "baseball" | "softball" | string;
  age: string;
  level: string;
  seasonLabel: string;
  seasonStart: string;
  seasonEnd: string;
  headCoach: string;
  coachEmail: string;
  assistants: string[];
  uniformPackageId: string;
  orgFee: number;
  coachMonthly: number;
  eventBudget: number;
  uniformDeadline: string | null;
  announcements: { id?: string; title?: string; body?: string; pin?: boolean; arrive?: string; uniform?: string; hotel?: string }[];
  attendance: Record<string, Record<string, string>>;
  tournamentIds: string[];
  otherCosts: Record<string, number>;
  teamCageHoursPerWeek: number;
  playerCageHoursPerWeek: number;
  gameChanger: { connected: boolean; teamId: string; lastSync: string | null };
  record: { w: number; l: number; t: number };
  roster: OsPlayer[];
  invites: OsInvite[];
  practices: {
    id: string;
    date: string;
    time: string;
    dur?: number;
    place?: string;
    where?: string;
    note?: string;
  }[];
  messages: { id: string; author?: string; from?: string; role?: string; ts?: number; at?: string; text?: string; body?: string }[];
  rsvps: Record<string, Record<string, string | null>>;
  pitchLog: { id: string; playerId: string; date: string; pitches: number; event?: string }[];
  sponsors: { id: string; name: string; amount: number; level?: string; playerId?: string | null; date?: string }[];
  withdrawn: OsPlayer[] | string[];
  actuals: Record<string, number> | null;
  closed: { realizedMargin?: number } | null;
  nextSeason: unknown;
  staff: OsStaff[];
  notes: string;
};

export type OsEvent = {
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
  type: string;
  stayToPlay?: boolean;
  verifiedOn?: string | null;
  sourceUrl?: string;
};

export type OsUniform = {
  id: string;
  name: string;
  sport: string;
  price: number;
  items: string[];
  blurb?: string;
  sizes?: string[];
  photos?: string[];
  colors?: string[];
  colourways?: string[];
  sizeFields?: string[];
  approved?: boolean;
};

export type OsUniformPhoto = {
  id: string;
  packageId: string;
  slot: string;
  src: string;
};

export type OsPoStatus = "draft" | "submitted" | "in-production" | "shipped" | "delivered";

export type OsPurchaseOrder = {
  id: string;
  number: string;
  teamId: string;
  packageId: string;
  supplier: string;
  expectedDelivery: string;
  status: OsPoStatus;
  createdAt: string;
  sizeDeadline: string | null;
  kind: "season" | "reorder";
  reorderReason?: "lost" | "growth" | "late-add" | null;
  billTo: "family" | "club";
  lines: { playerId: string; name: string; number: string | number; sizes: Record<string, string> }[];
};

export type OsCancelledEvent = {
  id: string;
  teamId: string;
  eventId: string;
  name: string;
  month: string;
  at: string;
  reason: string;
};

export type OsGame = {
  id: string;
  teamId: string;
  status: string;
  inning: string;
  opponent: string;
  oppRecord?: string;
  oppRuns: number;
  ourRuns: number;
  event: string;
  field: string;
  date: string;
  time: string;
  recap: string;
  line: number[];
  live?: {
    half: string;
    inning: number;
    outs: number;
    balls: number;
    strikes: number;
    bases: { first: string | null; second: string | null; third: string | null };
    batting: string;
    pitcher: Record<string, string | number>;
    batter: Record<string, string>;
    onDeck: string;
    inHole: string;
    lastPlay: string;
    bullpen: { name: string; num: number; pitches: number; status: string }[];
  };
};

export type OsLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  gradYear: number;
  position: string;
  sport: string;
  ageGroup: string;
  source: string;
  status: "lead" | "registered" | "evaluated" | "offer" | "accepted" | "waitlist" | string;
  scores: Record<string, number>;
  note: string;
  teamId?: string | null;
};

export type OsAlert = {
  kind: string;
  teamId: string;
  text: string;
  id?: string;
  band?: "health" | "safety" | "ops" | "money";
  bucket?: "today" | "week" | "fyi";
  playerId?: string;
  action?: string;
  desk?: string;
  record?: "team" | "player";
  tab?: string;
};

export type OsPlan = {
  fee: number;
  credits: number;
  net: number;
  dep: number;
  rows: { label: string; due: string; amount: number; status: string }[];
  deadline: Date | string | null;
  paid: number;
  remaining: number;
  locked?: boolean;
};

export type OsPrice = {
  evs: OsEvent[];
  entryFees: number;
  other: number;
  direct: number;
  contingency: number;
  protectedBudget: number;
  months: number;
  perPlayerTeam: number;
  coachTotal: number;
  coachPerPlayer: number;
  membershipPerPlayer: number;
  uniformCost: number;
  orgFee: number;
  raw: number;
  published: number;
  publishedNoUniform: number;
  roster: number;
  fundedPlayers: number;
  revenue: number;
  creditsGiven: number;
  sponsorIncome: number;
  uniformActual: number;
  facility: number;
  margin: number;
  forecastMargin: number;
  realizedMargin: number | null;
  actualSpend: number | null;
  closed: OsTeam["closed"];
  pkg: OsUniform | undefined;
};

export type OsArchive = {
  teamId: string;
  name: string;
  seasonLabel: string;
  closedAt: string;
  realized: number;
  record?: { w: number; l: number; t: number };
  roster: { id: string; name: string; number: number | string; stats: OsPlayer["stats"] }[];
};

export type OsPayout = {
  id: string;
  teamId: string;
  staffId: string;
  amount: number;
  date: string;
  kind: string;
};

export type ClubOs = {
  settings: {
    contingencyPct: number;
    membershipMonthly: number;
    facilityPerTeamMonth: number;
    fundingPlayers: number;
    cardFeePct: number;
    orgFeeMin: number;
    orgFeeMax: number;
    coachMin: number;
    coachMax: number;
    roundStep: number;
    paidInFullWeeks: number;
    cageHourlyRate: number;
    cageOpenHour: number;
    cageCloseHour: number;
    cageCount: number;
    devOsUrl: string;
    orgName: string;
    poTeamCostPct: number;
    sponsorCreditPct: number;
    cardSurchargeEnabled: boolean;
    acquisitionSpend: number;
    membershipIncludes: string[];
    policy: { version: number; depositRefundable: boolean; refundWindowDays: number; text: string };
    payroll: {
      classification: string;
      form1099Threshold: number;
      seTaxGuidancePct: number;
      accountablePlan: boolean;
    };
    messaging: { email: boolean; sms: boolean; fromEmail: string; smsName: string };
    automations: Record<string, boolean>;
  };
  teams: OsTeam[];
  catalog: OsEvent[];
  uniforms: OsUniform[];
  games: OsGame[];
  bookings: { scope: string; ownerId: string; week: string; hours: number; overage?: boolean; noShow?: boolean }[];
  leads: OsLead[];
  tryouts: { id: string; name: string; date: string; location: string; ageGroups: string[]; sport: string; fee: number }[];
  payouts: OsPayout[];
  reimbursements: OsReimbursement[];
  purchaseOrders: OsPurchaseOrder[];
  uniformPhotos?: OsUniformPhoto[];
  disruptions: unknown[];
  archive: OsArchive[];
  alumni: {
    id: string;
    name: string;
    gradYear: number;
    kind: string;
    school: string;
    division: string;
    position: string;
    committedOn: string;
    draftRound?: number;
    draftYear?: number;
  }[];
  notifications: { id: string; ts: number; teamId: string; title: string; body: string; kind: string; audience?: string }[];
  fieldCalls: {
    id: string;
    teamId: string;
    practiceId: string | null;
    status: string;
    at: string;
    note: string;
    newDate: string | null;
    newTime: string | null;
    newPlace: string | null;
  }[];
  cancelled: OsCancelledEvent[];
  audit: { id?: string; ts?: number; at?: string; actor?: string; action?: string; detail?: string }[];
  onboarding: Record<string, unknown>;
  _demo?: boolean;
};

export type OsView =
  | { kind: "desk" }
  | { kind: "team"; teamId: string; tab: string }
  | { kind: "player"; teamId: string; playerId: string; tab: string };

export const TEAM_RECORD_TABS = [
  { id: "overview", label: "Overview" },
  { id: "emergency", label: "Emergency" },
  { id: "packet", label: "Packet" },
  { id: "pitches", label: "Pitches" },
  { id: "roster", label: "Roster" },
  { id: "schedule", label: "Schedule" },
  { id: "practice", label: "Practice" },
  { id: "uniforms", label: "Uniforms" },
  { id: "game-day", label: "Game Day" },
  { id: "announcements", label: "Announcements" },
  { id: "attendance", label: "Attendance" },
  { id: "field-calls", label: "Field Calls" },
  { id: "cages", label: "Cages" },
  { id: "stats", label: "Stats" },
  { id: "chat", label: "Chat" },
  { id: "money", label: "Money", money: true },
] as const;

export const PLAYER_RECORD_TABS = [
  { id: "profile", label: "Profile" },
  { id: "stats", label: "Stats" },
  { id: "measurables", label: "Measurables" },
  { id: "documents", label: "Documents" },
  { id: "emergency", label: "Emergency" },
  { id: "account", label: "Account", money: true },
  { id: "uniform", label: "Uniform" },
  { id: "recruiting", label: "Recruiting Profile" },
] as const;
