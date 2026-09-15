export type Sport = "baseball" | "softball" | "";
export type Throws = "R" | "L" | "";
export type ViewerRole = "admin" | "coach" | "parent" | "player";

export type AthleteFrame = {
  height?: string | number;
  weight?: number;
  fatherHeight?: string | number;
  motherHeight?: string | number;
  cmjLoaded?: number;
  cmjUnloaded?: number;
  sprint10?: number;
  sprint30?: number;
};

export type Athlete = {
  id: string;
  firstName: string;
  lastName: string;
  sport: Sport;
  position: string;
  throws: Throws;
  bats: Throws;
  birthDate: string;
  graduationYear: number;
  familyId: string;
  coachIds: string[];
  opLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  assessmentComplete: boolean;
  school: string;
  city: string;
  notes: string;
  tags: string[];
  sex?: "M" | "F";
  archived?: boolean;
  movementScore?: number;
  frame?: AthleteFrame;
};

export type FamilyPlan = {
  type: "none" | "package" | "development" | "performance" | "elite" | "group" | "remote";
  lessonCredits: number;
  lessons?: number;
  remote?: number;
  tier?: "development" | "performance" | "elite";
};

export type Family = {
  id: string;
  name: string;
  parentName: string;
  email: string;
  phone: string;
  athleteIds: string[];
  plan?: FamilyPlan;
  leaderboardOptOut?: boolean;
};

export type Coach = {
  id: string;
  name: string;
  email: string;
  specialties: string[];
  active: boolean;
};

export type Service = {
  id: string;
  name: string;
  kind: string;
  price: number;
  minutes: number;
};

export type Package = {
  id: string;
  name: string;
  credits: number;
  price: number;
};

export type Membership = {
  id: string;
  name: string;
  price: number;
  detail: string;
};

export type Booking = {
  id: string;
  athleteId: string;
  serviceId: string;
  date: string;
  time: string;
  status: "paid" | "waitlist" | "cancelled" | "completed" | "unconfirmed";
  price: number;
  coachId?: string;
  dateLabel?: string;
  rescheduledMonth?: string;
  payout?: "unpaid" | "paid";
};

export type Availability = {
  id: string;
  coachId: string;
  weekday: string;
  window: string;
};

export type WaitlistEntry = {
  id: string;
  athleteId: string;
  serviceId: string;
  createdAt: string;
  preferredDay?: string;
  preferredTime?: string;
  status?: "open" | "offered" | "booked";
  note?: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: string;
};

export type Outing = {
  id: string;
  athleteId: string;
  date: string;
  opponent: string;
  ip: string;
  k: number;
  bb: number;
  notes: string;
  pitches?: number;
};

export type WorkoutLog = {
  id: string;
  athleteId: string;
  date: string;
  focus: string;
  rpe: number;
  notes: string;
};

export type StrengthLog = {
  id: string;
  athleteId: string;
  date: string;
  lift: string;
  value: number;
  unit: string;
};

export type PointsLog = {
  id: string;
  athleteId: string;
  date: string;
  points: number;
  reason: string;
  activity?: string;
  status?: "pending" | "verified" | "auto";
};

export type Scorecard = {
  id: string;
  athleteId: string;
  date: string;
  categories: { name: string; score: number }[];
  notes: string;
};

export type Evaluation = {
  id: string;
  athleteId: string;
  date: string;
  coachId: string;
  summary: string;
  grade: string;
};

export type Lesson = {
  id: string;
  athleteId: string;
  date: string;
  coachId: string;
  focus: string;
  minutes: number;
  notes: string;
};

export type FilmReview = {
  id: string;
  athleteId: string;
  date: string;
  title: string;
  notes: string;
};

export type Intervention = {
  id: string;
  athleteId: string;
  date: string;
  constraint: string;
  result: string;
  coachId?: string;
  method?: string;
  outcome?: string;
  band?: string;
  preScore?: number;
  postScore?: number;
};

export type Calibration = {
  id: string;
  athleteId: string;
  date: string;
  metric: string;
  target: number;
  actual: number;
};

export type CalibrationScore = {
  id: string;
  caseId: string;
  coachId: string;
  scores: {
    posture: number;
    direction: number;
    stride: number;
    separation: number;
    slot: number;
    balance: number;
  };
  at: string;
};

export type Policy = {
  freeCancelHours: number;
  partialRefundHours: number;
  lateCancelFeePct: number;
  noShowFeePct: number;
  newFamilyCredit: number;
  rescheduleDaysNotice: number;
  reschedulesPerMonth: number;
  verifyActivities: boolean;
};

export type CoachPayout = {
  id: string;
  coachId: string;
  serviceId: string;
  splitPct: number;
};

export type CoachOverride = {
  id: string;
  coachId: string;
  field: string;
  value: string;
};

export type Benchmark = {
  id: string;
  position: string;
  ages: string;
  metric: string;
  p50: number;
  p90: number;
  unit: string;
};

export type Certification = {
  id: string;
  athleteId: string;
  name: string;
  date: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
};

export type Message = {
  id: string;
  athleteId: string;
  fromName: string;
  fromRole: ViewerRole;
  body: string;
  createdAt: string;
  channel?: "family" | "coach";
};

export type DevPlan = {
  id: string;
  athleteId: string;
  focus: string;
  constraint: string;
  status: "active" | "draft";
};

export type Diagnose = {
  id: string;
  athleteId: string;
  finding: string;
  date: string;
};

export type Cohort = {
  id: string;
  name: string;
  athleteIds: string[];
};

export type GameIq = {
  id: string;
  athleteId: string;
  date: string;
  situation: string;
  note: string;
};

export type ReportCard = {
  id: string;
  athleteId: string;
  period: string;
  lines: { label: string; mark: string }[];
};

export type VelocityRow = {
  id: string;
  athleteId: string;
  date: string;
  mph: number;
};

export type Goal = {
  id: string;
  athleteId: string;
  title: string;
  target: string;
  status: string;
};

export type ArsenalPitch = {
  id: string;
  athleteId: string;
  pitch: string;
  role: string;
  velo: string;
};

export type PitchDesign = {
  id: string;
  athleteId: string;
  pitch: string;
  cue: string;
};

export type SkillPlan = {
  id: string;
  athleteId: string;
  skill: string;
  drill: string;
  dose: string;
};

export type Warmup = {
  id: string;
  athleteId: string;
  name: string;
  minutes: number;
};

export type StrengthSet = {
  id: string;
  athleteId: string;
  date: string;
  exerciseId: string;
  setNumber: number;
  weight: number;
  reps: number;
  rpe: number;
};

export type ThrowingAssignment = {
  id: string;
  athleteId: string;
  templateId: string;
  dayType: string;
};

export type BullpenPitch = {
  intent: { row: number; col: number };
  actual: { row: number; col: number; noncompetitive?: boolean };
  score?: number;
  velo?: number;
};

export type Bullpen = {
  id: string;
  athleteId: string;
  date: string;
  pitches: number;
  tci: number;
  notes: string;
  chart?: BullpenPitch[];
};

export type WorkloadDay = {
  id: string;
  athleteId: string;
  date: string;
  throws: number;
  rpe: number;
};

export type ArmCare = {
  id: string;
  athleteId: string;
  date: string;
  feel: number;
  notes: string;
};

export type PhysicalTest = {
  id: string;
  athleteId: string;
  date: string;
  test: string;
  value: string;
};

export type Metric = {
  id: string;
  athleteId: string;
  name: string;
  value: string;
  date: string;
};

export type RecruitingProfile = {
  athleteId: string;
  gpa: string;
  committed: string;
  video: string;
};

export type Intake = {
  athleteId: string;
  health: string;
  goals: string;
  complete: boolean;
};

export type VideoItem = {
  id: string;
  athleteId: string;
  title: string;
  date: string;
  angle: string;
};

export type DocumentItem = {
  id: string;
  athleteId: string;
  name: string;
  kind: string;
  date: string;
};

export type VideoStandard = {
  id: string;
  title: string;
  detail: string;
};

export type RecordViewId =
  | "overview"
  | "plan"
  | "diagnose"
  | "cohort"
  | "scorecard"
  | "game-iq"
  | "evaluations"
  | "report-card"
  | "peer-benchmarks"
  | "velocity"
  | "goals"
  | "arsenal"
  | "pitch-design"
  | "skill-plan"
  | "strength"
  | "warmups"
  | "bullpens"
  | "workload"
  | "points"
  | "leaderboard"
  | "arm-care"
  | "physical"
  | "metrics"
  | "lessons"
  | "game-film"
  | "video-standards"
  | "reports"
  | "recruiting"
  | "intake"
  | "videos"
  | "documents"
  | "messages";

export type RecordGroupId = "development" | "training" | "record";

export type RecordViewDef = {
  id: RecordViewId;
  label: string;
  coachOnly?: boolean;
};

export type RecordGroupDef = {
  id: RecordGroupId;
  label: string;
  views: RecordViewDef[];
};

export type DevelopmentData = {
  revision?: number;
  athletes: Athlete[];
  families: Family[];
  coaches: Coach[];
  services: Service[];
  packages: Package[];
  memberships: Membership[];
  bookings: Booking[];
  availability: Availability[];
  waitlist: WaitlistEntry[];
  leads: Lead[];
  outings: Outing[];
  workoutLog: WorkoutLog[];
  strengthLog: StrengthLog[];
  pointsLog: PointsLog[];
  scorecards: Scorecard[];
  evaluations: Evaluation[];
  lessons: Lesson[];
  filmReviews: FilmReview[];
  interventions: Intervention[];
  calibration: Calibration[];
  calibrationScores: CalibrationScore[];
  policy: Policy;
  coachPayouts: CoachPayout[];
  coachOverrides: CoachOverride[];
  benchmarks: Benchmark[];
  certifications: Certification[];
  auditLog: AuditEntry[];
  messages: Message[];
  plans: DevPlan[];
  diagnose: Diagnose[];
  cohorts: Cohort[];
  gameIq: GameIq[];
  reportCards: ReportCard[];
  velocity: VelocityRow[];
  goals: Goal[];
  arsenal: ArsenalPitch[];
  pitchDesign: PitchDesign[];
  skillPlans: SkillPlan[];
  warmups: Warmup[];
  strengthSets: StrengthSet[];
  throwingAssignments: ThrowingAssignment[];
  bullpens: Bullpen[];
  workload: WorkloadDay[];
  armCare: ArmCare[];
  physicalTests: PhysicalTest[];
  metrics: Metric[];
  recruiting: RecruitingProfile[];
  intake: Intake[];
  videos: VideoItem[];
  documents: DocumentItem[];
  videoStandards: VideoStandard[];
};
