import { dollars, ASSESSMENT_PRODUCTS } from "@/lib/pricing";
/** Verbatim commerce catalog. Do not rewrite. */

export const SERVICES_INIT = [
  { id: "s1", name: "New Pitcher Assessment", discipline: "Pitching", price: dollars("s1"), duration: 75, coachSplit: 55, entry: true, purpose: "Required entry point. 75 minutes, not an ordinary lesson." },
  { id: "s2", name: "Private Development 30", discipline: "Pitching", price: dollars("s2"), duration: 30, coachSplit: 60, purpose: "Focused recurring session." },
  { id: "s3", name: "Private Development 60", discipline: "Pitching", price: dollars("s3"), duration: 60, coachSplit: 60, purpose: "Full development session." },
  { id: "s4", name: "Pitching Lab / Reassessment", discipline: "Pitching", price: dollars("s4"), duration: 60, coachSplit: 55, purpose: "Objective testing and pitch design." },
  { id: "s5", name: "Remote Video Review", discipline: "Pitching", price: dollars("s5"), duration: 20, coachSplit: 65, purpose: "Asynchronous film feedback." },
  { id: "s6", name: "Small-Group Pitcher Development", discipline: "Pitching", price: dollars("s6"), duration: 75, coachSplit: 50, group: true, purpose: "Weekly coached training, 3–5 pitchers. Billed monthly." },
  { id: "s7", name: "Private Hitting 30", discipline: "Hitting", price: dollars("s7"), duration: 30, coachSplit: 60, purpose: "Focused recurring session." },
  { id: "s8", name: "Private Hitting 60", discipline: "Hitting", price: dollars("s8"), duration: 60, coachSplit: 60, purpose: "Full development session." },
  { id: "s9", name: "Hitting Assessment", discipline: "Hitting", price: dollars("s9"), duration: 60, coachSplit: 55, purpose: "Baseline swing, contact and power." },
  { id: "s10", name: "Private Catching 30", discipline: "Catching", price: dollars("s10"), duration: 30, coachSplit: 60, purpose: "Focused recurring session." },
  { id: "s11", name: "Private Catching 60", discipline: "Catching", price: dollars("s11"), duration: 60, coachSplit: 60, purpose: "Full development session." },
  { id: "s12", name: "Private Fielding 60", discipline: "Fielding", price: dollars("s12"), duration: 60, coachSplit: 60, purpose: "Infield or outfield development." },
] as const;

export const PACKAGES_INIT = [
  { id: "p1", name: "4-Session Package (30 min)", credits: 4, price: dollars("p1"), expiresDays: 120 },
  { id: "p2", name: "4-Session Package (60 min)", credits: 4, price: dollars("p2"), expiresDays: 120 },
  { id: "p3", name: "8-Session Package (60 min)", credits: 8, price: dollars("p3"), expiresDays: 180 },
] as const;

export const MEMBERSHIPS_INIT = [
  { id: "m1", tier: "development", name: "Development Membership", price: dollars("m1"), lessons: 4, minutes: 30, remote: 0, rollover: "1 session", blurb: "Four 30-minute sessions plus the development system.",
    includes: ["Four 30-minute sessions", "Athlete profile", "Personal development priorities", "Drill library assignments", "Session recaps", "Throwing and workload tracking", "Monthly progress update"] },
  { id: "m2", tier: "performance", name: "Performance Membership", price: dollars("m2"), lessons: 4, minutes: 60, remote: 1, rollover: "1 session", blurb: "Four 60-minute sessions plus video and pitch development.",
    includes: ["Four 60-minute sessions", "Everything in Development", "Video analysis", "Expanded command work", "Pitch development", "Periodic reassessment", "Game-performance tracking", "Priority recurring slot"] },
  { id: "m3", tier: "elite", name: "Elite Hybrid Membership", price: dollars("m3"), lessons: 4, minutes: 60, remote: 4, rollover: "1 session", blurb: "Everything in Performance plus film review and higher-touch support.",
    includes: ["Everything in Performance", "One monthly game-film review", "Higher-touch asynchronous video feedback", "Monthly roadmap update", "Quarterly Pitching Lab / advanced assessment", "Priority scheduling"] },
  { id: "m4", tier: "group", name: "Small-Group Development", price: dollars("m4"), lessons: 4, minutes: 75, remote: 0, rollover: "None", blurb: "One 75-minute group session weekly, 3–5 comparable pitchers.",
    includes: ["Weekly 75-minute group session", "Command competition and mound situations", "Athlete profile", "Session recaps"] },
  { id: "m5", tier: "remote", name: "Remote HS Pitching Coaching", price: dollars("m5"), lessons: 0, minutes: 0, remote: 4, rollover: "None", blurb: "Fully remote programming and film feedback.",
    includes: ["Monthly programming", "Four video reviews", "Throwing and workload tracking", "Monthly roadmap update"] },
] as const;

export type ServiceInit = (typeof SERVICES_INIT)[number];
export type PackageInit = (typeof PACKAGES_INIT)[number];
export type MembershipInit = (typeof MEMBERSHIPS_INIT)[number];

export const FEATURE_LABELS: Record<string, string> = {
  profile: "Athlete profile",
  video: "Session recaps and video",
  drills: "Drill library assignments",
  schedule: "Recurring schedule",
  tracking: "Throwing and workload tracking",
  reassessment: "Periodic reassessment",
  strength: "Strength logging",
  videoReview: "Video analysis",
  pitchDesign: "Pitch development",
  gameTracking: "Game-performance tracking",
  priority: "Priority recurring slot",
  film: "Monthly game-film review",
  monthlyReport: "Monthly roadmap update",
  access: "Higher-touch access",
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function serviceById(id: string) {
  return SERVICES_INIT.find((row) => row.id === id);
}

export function membershipById(id: string) {
  return MEMBERSHIPS_INIT.find((row) => row.id === id);
}

export function packageById(id: string) {
  return PACKAGES_INIT.find((row) => row.id === id);
}

export function requiresAssessment(row: ServiceInit) {
  return !ASSESSMENT_PRODUCTS.has(row.id) && row.id !== "s6";
}

export function coachForDiscipline(discipline: string) {
  if (discipline === "Hitting" || discipline === "Catching") return "c-hitting";
  return "c-steve";
}

export function lessonServiceForPlan(minutes: number) {
  if (minutes === 30) return "s2";
  if (minutes === 75) return "s6";
  if (minutes === 20 || minutes === 0) return "s5";
  return "s3";
}

export function coachSplitFor(serviceId: string) {
  return serviceById(serviceId)?.coachSplit ?? 60;
}

export function earningAmount(price: number, serviceId: string) {
  return Math.round((price * coachSplitFor(serviceId)) / 100);
}
