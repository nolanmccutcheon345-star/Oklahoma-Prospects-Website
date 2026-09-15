import { CLUB } from "@/lib/club";
import type { ClubRole } from "@/lib/club-data";

/** Single switchboard for the Player Development OS. Turn the role switcher off here. */
export const PD_OS = {
  businessName: CLUB.name,
  phone: CLUB.phoneDisplay,
  addressLine: `${CLUB.addressLine1}, ${CLUB.addressLine2}`,
  showRoleSwitcher: false,
} as const;

export const PD_POLICY = {
  freeCancelHours: 48,
  partialRefundHours: 24,
  lateCancelFeePct: 50,
  noShowFeePct: 100,
  rescheduleDaysNotice: 5,
  reschedulesPerMonth: 1,
  newFamilyCredit: 0,
  parentReferralCredit: 0,
  assessmentSurcharge: 50,
} as const;

export const MEMBERSHIP_RULES = [
  "One unused session may roll into the following month. Credits do not accumulate indefinitely.",
  "You can stop auto-renew online anytime — no phone call, no retention gauntlet.",
  "The 48-hour refund window still applies to unused sessions in the current month.",
  "Pause for a legitimate extended absence or injury.",
  "No hidden fees. Auto-renew is disclosed at checkout and on every receipt.",
  "Full billing history is always available in the family portal.",
] as const;

export const OP_LEVELS = [
  {
    level: 1,
    code: "OP-1",
    name: "Learn to Throw",
    ages: "8U",
    goal: "Athletic throwers who enjoy pitching.",
    arsenal: "Fastball and changeup. Nothing else required.",
  },
  {
    level: 2,
    code: "OP-2",
    name: "Build the Throw",
    ages: "9–10U",
    goal: "Coordination, strikes, and confidence.",
    arsenal: "Fastball and changeup. Nothing else required.",
  },
  {
    level: 3,
    code: "OP-3",
    name: "Learn to Pitch",
    ages: "11–12U",
    goal: "Attack hitters, change speeds, pitch ahead.",
    arsenal: "Fastball and changeup. Breaking balls still not required.",
  },
  {
    level: 4,
    code: "OP-4",
    name: "Build the Pitcher",
    ages: "13–14U",
    goal: "First major transition. One breaking ball introduced.",
    arsenal: "FB, CH, and one breaking ball — curve or slider, not both.",
  },
  {
    level: 5,
    code: "OP-5",
    name: "Develop Weapons",
    ages: "15–16U",
    goal: "Velocity, command, and pitch-design phases.",
    arsenal: "Full working arsenal, individualized to the athlete.",
  },
  {
    level: 6,
    code: "OP-6",
    name: "Recruitable Pitcher",
    ages: "17–18U",
    goal: "What gets this athlete hitters out at the next level?",
    arsenal: "Every pitch gets a defined role.",
  },
  {
    level: 7,
    code: "OP-7",
    name: "Performance Optimization",
    ages: "College",
    goal: "Throwing, biomechanics, pitch design, command, strength, recovery.",
    arsenal: "Full metric package on every pitch type.",
  },
] as const;

export const ASSESSMENT_PHASES = [
  "Athlete interview and health screen",
  "Movement and power tests when equipment exists",
  "Catch-play assessment",
  "Mechanical scorecard (10 categories, 0–3)",
  "Baseline bullpen scored to called location",
  "Video capture — open side and rear",
  "One intervention, then retest",
  "Development meeting with the family",
] as const;

export const DESKS = {
  admin: [
    { id: "overview", label: "Overview" },
    { id: "today", label: "Today" },
    { id: "lesson", label: "Lesson" },
    { id: "athletes", label: "Athletes" },
    { id: "coaches", label: "Coaches" },
    { id: "programs", label: "Programs" },
    { id: "toolkit", label: "Toolkit" },
    { id: "business", label: "Business" },
    { id: "retention", label: "Retention" },
    { id: "evidence", label: "Evidence" },
    { id: "my-account", label: "My Account" },
  ],
  coach: [
    { id: "today", label: "Today" },
    { id: "lesson", label: "Lesson" },
    { id: "roster", label: "Roster" },
    { id: "toolkit", label: "Toolkit" },
    { id: "my-account", label: "My Account" },
  ],
  parent: [
    { id: "home", label: "Home" },
    { id: "plan", label: "My Plan" },
    { id: "progress", label: "Progress" },
    { id: "training", label: "Training" },
    { id: "intake", label: "Intake" },
  ],
  player: [
    { id: "today", label: "Today" },
    { id: "training", label: "Training" },
    { id: "points", label: "Points" },
    { id: "leaderboard", label: "Leaderboard" },
    { id: "progress", label: "Progress" },
    { id: "goals", label: "Goals" },
  ],
} as const;

export type DeskId = (typeof DESKS)[keyof typeof DESKS][number]["id"];

export const ROLE_LABEL: Record<ClubRole, string> = {
  admin: "Admin",
  coach: "Coach",
  parent: "Parent",
  player: "Athlete",
};

export function densityForRole(role: ClubRole): "compact" | "comfortable" {
  return role === "admin" || role === "coach" ? "compact" : "comfortable";
}

export function moneyForRole(role: string, amount: number) {
  if (role === "player") return null;
  return `$${amount}`;
}
