import type { ClubOs, OsEvent, OsTeam } from "./model";
import { iso, uid } from "./engine/00-helpers.js";
import { logAudit, notify } from "./engine/03-domain.js";
import { applyIssueAmendments } from "./money.ts";

export const REGION_STATES = ["OK", "TX", "AR", "KS"] as const;
export const SHOWCASE_ORGS = ["Five Tool", "Perfect Game", "Bigfire", "PBR Prep"] as const;
export const RSVP_VALUES = ["going", "maybe", "can't"] as const;
export type OsRsvp = (typeof RSVP_VALUES)[number];

export function ageYears(age: string): number {
  const n = Number(String(age).replace(/U/i, ""));
  return Number.isFinite(n) ? n : 0;
}

export function isShowcaseOrg(org: string): boolean {
  return SHOWCASE_ORGS.includes(org as (typeof SHOWCASE_ORGS)[number]);
}

export function isStayToPlay(event: OsEvent | null | undefined): boolean {
  if (!event) return false;
  return Boolean(event.stayToPlay) || event.type === "showcase";
}

export function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= (bEnd || bStart) && bStart <= (aEnd || aStart);
}

export function eventInSeason(event: OsEvent, team: OsTeam): boolean {
  const start = event.start;
  return start >= team.seasonStart && start <= team.seasonEnd;
}

export function eventEligible(event: OsEvent, team: OsTeam): boolean {
  if (event.sport !== team.sport) return false;
  if (!REGION_STATES.includes(event.state as (typeof REGION_STATES)[number])) return false;
  if (!(event.ages || []).includes(team.age)) return false;
  if (!(event.levels || []).includes(team.level)) return false;
  if (!eventInSeason(event, team)) return false;
  if ((isShowcaseOrg(event.org) || event.type === "showcase") && ageYears(team.age) < 15) {
    return false;
  }
  return true;
}

export function eligibleEvents(catalog: OsEvent[], team: OsTeam): OsEvent[] {
  return catalog
    .filter((e) => eventEligible(e, team))
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));
}

export function sharePct(fee: number, budget: number): number {
  if (!budget) return 0;
  return Math.round((Number(fee) || 0) / budget * 100);
}

export function formatShare(pct: number): string {
  return `${Math.max(0, Math.round(pct))}% of budget`;
}

export function spentOf(team: OsTeam, catalog: OsEvent[]): number {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  return (team.tournamentIds || []).reduce((sum, id) => sum + (Number(byId.get(id)?.fee) || 0), 0);
}

export function scheduledEvents(team: OsTeam, catalog: OsEvent[]): OsEvent[] {
  const byId = new Map(catalog.map((e) => [e.id, e]));
  return (team.tournamentIds || []).map((id) => byId.get(id)).filter((e): e is OsEvent => Boolean(e));
}

export function conflictsWith(
  event: OsEvent,
  others: OsEvent[],
  exceptId?: string | null,
): OsEvent | null {
  return (
    others.find(
      (o) =>
        o.id !== event.id &&
        o.id !== exceptId &&
        datesOverlap(event.start, event.end || event.start, o.start, o.end || o.start),
    ) || null
  );
}

export function wouldOverflow(team: OsTeam, catalog: OsEvent[], event: OsEvent): boolean {
  if ((team.tournamentIds || []).includes(event.id)) return false;
  const budget = Number(team.eventBudget) || 0;
  return spentOf(team, catalog) + (Number(event.fee) || 0) > budget;
}

export type Slate = {
  ids: string[];
  events: OsEvent[];
  spent: number;
  budget: number;
  skippedConflict: number;
  skippedBudget: number;
  short: boolean;
};

export function buildSlate(catalog: OsEvent[], team: OsTeam, count: number): Slate {
  const want = Math.max(1, Math.min(12, Number(count) || 1));
  const budget = Number(team.eventBudget) || 0;
  const pool = eligibleEvents(catalog, team);
  const picked: OsEvent[] = [];
  let spent = 0;
  let skippedConflict = 0;
  let skippedBudget = 0;
  for (const event of pool) {
    if (picked.length >= want) break;
    if (conflictsWith(event, picked)) {
      skippedConflict += 1;
      continue;
    }
    const fee = Number(event.fee) || 0;
    if (spent + fee > budget) {
      skippedBudget += 1;
      continue;
    }
    picked.push(event);
    spent += fee;
  }
  return {
    ids: picked.map((e) => e.id),
    events: picked,
    spent,
    budget,
    skippedConflict,
    skippedBudget,
    short: picked.length < want,
  };
}

export function replacementsFor(
  catalog: OsEvent[],
  team: OsTeam,
  cancelled: OsEvent,
): OsEvent[] {
  const remaining = scheduledEvents(team, catalog).filter((e) => e.id !== cancelled.id);
  const month = (cancelled.start || "").slice(0, 7);
  return eligibleEvents(catalog, team).filter((event) => {
    if (event.id === cancelled.id) return false;
    if ((team.tournamentIds || []).includes(event.id)) return false;
    if ((event.start || "").slice(0, 7) !== month) return false;
    if (conflictsWith(event, remaining)) return false;
    return true;
  });
}

export function normalizeRsvp(value: string | null | undefined): OsRsvp | null {
  const v = String(value || "").trim().toLowerCase();
  if (v === "going" || v === "in" || v === "yes") return "going";
  if (v === "maybe") return "maybe";
  if (v === "can't" || v === "cant" || v === "out" || v === "no" || v === "cannot") return "can't";
  return null;
}

export function rsvpCounts(team: OsTeam, eventId: string) {
  const board = team.rsvps?.[eventId] || {};
  const active = team.roster.filter((p) => !p.withdrawn);
  let going = 0;
  let maybe = 0;
  let cant = 0;
  let none = 0;
  for (const p of active) {
    const v = normalizeRsvp(board[p.id]);
    if (v === "going") going += 1;
    else if (v === "maybe") maybe += 1;
    else if (v === "can't") cant += 1;
    else none += 1;
  }
  return { going, maybe, cant, none, total: active.length };
}

export function rsvpHoldouts(team: OsTeam, eventId: string): string[] {
  const board = team.rsvps?.[eventId] || {};
  return team.roster
    .filter((p) => !p.withdrawn && !normalizeRsvp(board[p.id]))
    .map((p) => p.name);
}

export function coachEventCopy(event: OsEvent, pct: number): string {
  const stay = isStayToPlay(event) ? " · stay-to-play" : "";
  return `${event.name} · ${event.city}, ${event.state} · ${event.start} · ${formatShare(pct)}${stay}`;
}

export function coachCopyHasMoney(text: string): boolean {
  return /\$|usd|entry fee/i.test(text);
}

function ping(
  club: ClubOs,
  teamId: string,
  title: string,
  body: string,
  kind: string,
  audience: string,
) {
  notify(club, teamId, title, body, kind, audience);
}

export function applyAddEvent(
  club: ClubOs,
  teamId: string,
  eventId: string,
  actor: string,
): { ok: boolean; reason?: "missing" | "already" | "filter" | "conflict" | "budget" } {
  const team = club.teams.find((t) => t.id === teamId);
  const event = club.catalog.find((e) => e.id === eventId);
  if (!team || !event) return { ok: false, reason: "missing" };
  if ((team.tournamentIds || []).includes(eventId)) return { ok: false, reason: "already" };
  if (!eventEligible(event, team)) return { ok: false, reason: "filter" };
  const on = scheduledEvents(team, club.catalog);
  if (conflictsWith(event, on)) return { ok: false, reason: "conflict" };
  if (wouldOverflow(team, club.catalog, event)) return { ok: false, reason: "budget" };
  team.tournamentIds = [...(team.tournamentIds || []), eventId];
  logAudit(club, actor, "schedule-add", `${team.name} added ${event.name}`);
  ping(club, team.id, "Schedule updated", `${event.name} is on ${team.name}.`, "schedule", "all");
  applyIssueAmendments(club, team.id, "all", actor);
  return { ok: true };
}

export function applyAskBudget(
  club: ClubOs,
  teamId: string,
  eventId: string,
  actor: string,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  const event = club.catalog.find((e) => e.id === eventId);
  if (!team || !event) return club;
  ping(
    club,
    team.id,
    "Budget request",
    `${actor || team.headCoach} on ${team.name} is at budget and asked to add ${event.name}.`,
    "money",
    "admin",
  );
  logAudit(club, actor, "ask-budget", `${team.name} asked for budget to add ${event.name}`);
  return club;
}

export function applyCancelEvent(
  club: ClubOs,
  teamId: string,
  eventId: string,
  actor: string,
  reason = "Cancelled",
): { club: ClubOs; replacements: OsEvent[] } {
  const team = club.teams.find((t) => t.id === teamId);
  const event = club.catalog.find((e) => e.id === eventId);
  if (!team || !event) return { club, replacements: [] };
  const replacements = replacementsFor(club.catalog, team, event);
  team.tournamentIds = (team.tournamentIds || []).filter((id) => id !== eventId);
  if (!club.cancelled) club.cancelled = [];
  club.cancelled.unshift({
    id: uid(),
    teamId: team.id,
    eventId: event.id,
    name: event.name,
    month: event.start.slice(0, 7),
    at: iso(new Date(2026, 8, 15)),
    reason,
  });
  ping(
    club,
    team.id,
    "Event cancelled",
    `${event.name} is off ${team.name}. ${reason}.`,
    "schedule",
    "all",
  );
  logAudit(club, actor, "schedule-cancel", `${team.name} cancelled ${event.name}`);
  return { club, replacements };
}

export function applySlate(
  club: ClubOs,
  teamId: string,
  ids: string[],
  actor: string,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  team.tournamentIds = [...ids];
  ping(
    club,
    team.id,
    "Season slate set",
    `${team.name} locked ${ids.length} event${ids.length === 1 ? "" : "s"} for the season.`,
    "schedule",
    "all",
  );
  logAudit(club, actor, "schedule-slate", `${team.name} slate ${ids.join(",")}`);
  applyIssueAmendments(club, team.id, "all", actor);
  return club;
}

export function applyRsvp(
  club: ClubOs,
  teamId: string,
  eventId: string,
  playerId: string,
  value: OsRsvp,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  if (!team.rsvps) team.rsvps = {};
  if (!team.rsvps[eventId]) team.rsvps[eventId] = {};
  team.rsvps[eventId][playerId] = value;
  return club;
}

export function applyNudgeRsvp(
  club: ClubOs,
  teamId: string,
  eventId: string,
  actor: string,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  const event = club.catalog.find((e) => e.id === eventId);
  if (!team || !event) return club;
  const names = rsvpHoldouts(team, eventId);
  if (!names.length) return club;
  const who = names.length <= 3 ? names.join(", ") : `${names.length} families`;
  ping(
    club,
    team.id,
    "RSVP nudge",
    `${who} still need to answer ${event.name}.`,
    "chase",
    "all",
  );
  logAudit(club, actor, "rsvp-nudge", `${event.name}: ${names.join(", ")}`);
  return club;
}

export function icsEscape(value: string): string {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function icsForTeam(team: OsTeam, events: OsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Oklahoma Prospects//Team OS//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const event of events) {
    const end = event.end || event.start;
    const dtEndDate = new Date(`${end}T12:00:00`);
    dtEndDate.setDate(dtEndDate.getDate() + 1);
    const dtEnd = iso(dtEndDate).replace(/-/g, "");
    const stay = isStayToPlay(event)
      ? "Stay-to-play. Lodging is paid by each family and is not part of the team fee."
      : `${event.org} · ${team.name}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@prospectsbaseball.club`,
      `DTSTART;VALUE=DATE:${event.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${icsEscape(event.name)}`,
      `LOCATION:${icsEscape(`${event.city}, ${event.state}`)}`,
      `DESCRIPTION:${icsEscape(stay)}`,
      "END:VEVENT",
    );
  }
  for (const p of team.practices || []) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${p.id}@prospectsbaseball.club`,
      `DTSTART;VALUE=DATE:${String(p.date).replace(/-/g, "")}`,
      `SUMMARY:${icsEscape(`Practice · ${team.name}`)}`,
      `LOCATION:${icsEscape(p.place || p.where || "TBD")}`,
      `DESCRIPTION:${icsEscape(p.note || p.time || "")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
