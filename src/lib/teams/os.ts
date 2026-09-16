import { CLUB } from "@/lib/club";
import type { ClubRole } from "@/lib/club-data";

/** Single switchboard for the Team Management OS. Turn the role switcher off here. */
export const TEAMS_OS = {
  orgName: CLUB.name,
  phone: CLUB.phoneDisplay,
  addressLine: `${CLUB.addressLine1}, ${CLUB.addressLine2}`,
  showRoleSwitcher: false,
  devAppUrl: "https://app.prospectsbaseball.club",
} as const;


export const TEAM_ROLES: ClubRole[] = ["admin", "coach", "parent", "player"];

export const TEAM_ROLE_LABEL: Record<ClubRole, string> = {
  admin: "Admin",
  coach: "Coach",
  parent: "Parent",
  player: "Player",
};

export const TEAM_DESKS = {
  admin: [
    { id: "overview", label: "Overview" },
    { id: "alerts", label: "Alerts" },
    { id: "collections", label: "Collections" },
    { id: "cash", label: "Cash Flow" },
    { id: "budget", label: "Team Budget" },
    { id: "close", label: "Season Close" },
    { id: "teams", label: "Teams" },
    { id: "staff", label: "Staff" },
    { id: "payroll", label: "Contractor payouts" },
    { id: "tryouts", label: "Tryouts" },
    { id: "analytics", label: "Analytics" },
    { id: "archive", label: "Archive" },
    { id: "agreements", label: "Agreements" },
    { id: "automations", label: "Automations" },
    { id: "exports", label: "Exports" },
    { id: "audit", label: "Audit" },
    { id: "settings", label: "Settings" },
  ],
  coach: [
    { id: "alerts", label: "Alerts" },
    { id: "emergency", label: "Emergency" },
    { id: "packet", label: "Packet" },
    { id: "pitches", label: "Pitches" },
    { id: "game-day", label: "Game Day" },
    { id: "field", label: "Field" },
    { id: "cages", label: "Cages" },
    { id: "roster", label: "Roster" },
    { id: "schedule", label: "Schedule" },
    { id: "uniforms", label: "Uniforms" },
    { id: "today", label: "Today" },
  ],
  parent: [
    { id: "home", label: "Home" },
    { id: "alerts", label: "Alerts" },
    { id: "fees", label: "Fees" },
    { id: "team", label: "Team" },
    { id: "schedule", label: "Schedule" },
    { id: "documents", label: "Documents" },
    { id: "cages", label: "Cages" },
    { id: "my-player", label: "My Player" },
  ],
  player: [
    { id: "today", label: "Today" },
    { id: "alerts", label: "Alerts" },
    { id: "schedule", label: "Schedule" },
    { id: "team", label: "Team" },
    { id: "chat", label: "Chat" },
    { id: "stats", label: "Stats" },
    { id: "documents", label: "Documents" },
    { id: "sizes", label: "Sizes" },
    { id: "cages", label: "Cages" },
  ],
} as const;

export type TeamDeskId = (typeof TEAM_DESKS)[keyof typeof TEAM_DESKS][number]["id"];

/** Second-level items — placeholders until later steps fill them in. */
export const TEAM_NEXT: Record<string, string[]> = {
  alerts: ["Today", "This week", "FYI"],
  automations: ["Reminders", "Chases", "Digest"],
  exports: ["CSV", "JSON backup"],
  audit: ["Waivers", "Withdrawals", "Closures"],
  collections: ["Past due", "No deposit", "No backup"],
  cash: ["Inflow", "Outflow", "Short month"],
  budget: ["Waterfall", "Signed prices", "Amendments"],
  close: ["Actuals", "Contingency", "Archive"],
  teams: ["13U Navy", "14U Maroon", "Openings"],
  staff: ["Pay election", "W-9", "SafeSport"],
  payroll: ["Gross", "Applied", "Cash"],
  tryouts: ["Leads", "Evals", "Offers"],
  analytics: ["Fill", "Collections", "Scorecards"],
  archive: ["Rosters", "Records", "Export"],
  agreements: ["Unsigned", "Chase all", "Policy"],
  recruiting: ["Leads", "Evals", "Offers"],
  settings: ["Fees", "Season", "Policy"],
  today: ["Practice", "Messages", "Who's late"],
  emergency: ["Allergies", "Guardians", "Insurance"],
  packet: ["Submission", "Travel", "Pitching plan"],
  pitches: ["Log outing", "Rest", "Age max"],
  field: ["Calls", "Attendance", "Announcements"],
  "my-team": ["Record", "Budget", "Cages"],
  roster: ["Eligibility", "Sizes", "Pitch counts"],
  schedule: ["Practices", "Tournaments", "Travel"],
  uniforms: ["Package", "Sizes", "Purchase order"],
  "game-day": ["Lineup", "Book", "Post-game"],
  home: ["Next event", "Balance", "Forms"],
  fees: ["Plan", "Receipts", "Card on file"],
  team: ["Announcements", "Roster", "Ride board"],
  documents: ["Waiver", "Birth cert", "Physical"],
  "my-player": ["Profile", "Playing time", "Notes"],
  stats: ["Hitting", "Pitching", "Fielding"],
  cages: ["Team hours", "Player hours", "Book a lane"],
  chat: ["Thread", "Coach", "Team"],
  sizes: ["Jersey", "Pants", "Cap"],
};

export function densityForTeamRole(role: ClubRole): "compact" | "comfortable" {
  return role === "admin" || role === "coach" ? "compact" : "comfortable";
}

export function formatTeamMoney(amount: number) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
