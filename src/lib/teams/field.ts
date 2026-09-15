import type { ClubOs, OsPlayer, OsTeam } from "./model";
import { TODAY, d, iso, uid } from "./engine/00-helpers.js";
import {
  DOC_LABELS,
  PITCH_LIMIT,
  creditsUsed,
  logAudit,
  missingDocs,
  notify,
  pitcherStatus,
  restDays,
} from "./engine/03-domain.js";
import { normalizeRsvp } from "./schedule.ts";

export { PITCH_LIMIT, restDays, pitcherStatus, DOC_LABELS };

export const ATTEND_MARKS = ["present", "late", "excused", "absent"] as const;
export type OsAttend = (typeof ATTEND_MARKS)[number];

export const FIELD_STATUSES = ["delayed", "moved", "cancelled", "on"] as const;
export type OsFieldStatus = (typeof FIELD_STATUSES)[number];

export const FIELD_STATUS_LABEL: Record<OsFieldStatus, string> = {
  delayed: "Delayed",
  moved: "Moved",
  cancelled: "Cancelled",
  on: "Back on",
};

export type OsFieldCall = {
  id: string;
  teamId: string;
  practiceId: string | null;
  status: OsFieldStatus;
  at: string;
  note: string;
  newDate: string | null;
  newTime: string | null;
  newPlace: string | null;
};

export type OsBooking = {
  scope: "team" | "player";
  ownerId: string;
  week: string;
  hours: number;
  overage?: boolean;
  noShow?: boolean;
};

export function weekSunday(date: Date | string = TODAY): string {
  const t = d(date);
  t.setDate(t.getDate() - t.getDay());
  return iso(t);
}

export function isPitcher(player: OsPlayer | null | undefined): boolean {
  if (!player) return false;
  if (player.roleType === "po") return true;
  const pos = Array.isArray(player.positions)
    ? player.positions.join(" ")
    : String(player.positions || "");
  return /\b(P|RHP|LHP|Pitcher)\b/i.test(pos);
}

export function docsMissingOf(player: OsPlayer): string[] {
  return (missingDocs(player) as string[]) || [];
}

export function ineligibleReason(player: OsPlayer): string {
  const miss = docsMissingOf(player);
  if (!miss.length) return "";
  const labels = miss.map((k) => (DOC_LABELS as Record<string, string>)[k] || k);
  return labels.join(", ");
}

export function submissionRoster(team: OsTeam): {
  eligible: OsPlayer[];
  ineligible: { player: OsPlayer; missing: string[]; reason: string; birthCert: boolean }[];
} {
  const eligible: OsPlayer[] = [];
  const ineligible: { player: OsPlayer; missing: string[]; reason: string; birthCert: boolean }[] =
    [];
  for (const player of team.roster.filter((p) => !p.withdrawn)) {
    const missing = docsMissingOf(player);
    if (missing.length) {
      ineligible.push({
        player,
        missing,
        reason: ineligibleReason(player),
        birthCert: missing.includes("birthCert"),
      });
    } else {
      eligible.push(player);
    }
  }
  return { eligible, ineligible };
}

export function travelRoster(team: OsTeam, eventId: string | null | undefined) {
  const board = eventId ? team.rsvps?.[eventId] || {} : {};
  return team.roster
    .filter((p) => !p.withdrawn)
    .filter((p) => {
      if (!eventId) return true;
      return normalizeRsvp(board[p.id]) === "going";
    })
    .map((p) => ({
      player: p,
      going: eventId ? normalizeRsvp(board[p.id]) === "going" : true,
      guardians: p.parents || [],
      emergency: p.emergency,
    }));
}

export function pitchingPlan(team: OsTeam) {
  const list = team.roster.filter((p) => !p.withdrawn && isPitcher(p));
  return list.map((player) => {
    const st = pitcherStatus(team, player.id) as {
      available: boolean;
      last: { date: string; pitches: number; event?: string } | null;
      need: number;
      readyOn: string | null;
    };
    return { player, ...st };
  });
}

export function eventSheetCopy(
  team: OsTeam,
  event: { name: string; city?: string; state?: string; start?: string; end?: string } | null,
  announcement?: { title?: string; body?: string; arrive?: string; uniform?: string; hotel?: string } | null,
): string {
  const lines = [
    team.name,
    team.headCoach ? `Coach ${team.headCoach}` : "",
    event ? `${event.name}` : "Next event TBD",
    event?.city ? `${event.city}, ${event.state}` : "",
    event?.start ? `${event.start}${event.end && event.end !== event.start ? `–${event.end}` : ""}` : "",
    announcement?.arrive ? `Arrive ${announcement.arrive}` : "",
    announcement?.uniform ? `Uniform ${announcement.uniform}` : "",
    announcement?.hotel ? `Hotel ${announcement.hotel}` : "",
    announcement?.body || "",
    "Hats on. No surprise locations.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function packetText(team: OsTeam, event: { name: string; start?: string } | null): string {
  const sub = submissionRoster(team);
  const travel = travelRoster(team, team.tournamentIds?.[0]);
  const plan = pitchingPlan(team);
  const lines: string[] = [
    `${team.name} · tournament packet`,
    event ? `${event.name}${event.start ? ` · ${event.start}` : ""}` : "Event TBD",
    "",
    "SUBMISSION ROSTER",
  ];
  for (const p of sub.eligible) {
    lines.push(`#${p.number} ${p.name}`);
  }
  lines.push("", "INELIGIBLE");
  if (!sub.ineligible.length) lines.push("None.");
  for (const row of sub.ineligible) {
    lines.push(`${row.player.name} — ${row.reason}${row.birthCert ? " (birth certificate)" : ""}`);
  }
  lines.push("", "TRAVEL ROSTER");
  for (const row of travel) {
    const g = (row.guardians || [])
      .map((x) => `${x.name} ${x.phone || ""}`.trim())
      .join("; ");
    const med = [row.emergency?.allergies, row.emergency?.conditions].filter(Boolean).join(" · ");
    lines.push(
      `${row.player.name} · ${g || "no guardian on file"}${med ? ` · ${med}` : ""} · ${row.emergency?.insurer || ""} ${row.emergency?.policyNo || ""}`.trim(),
    );
  }
  lines.push("", "PITCHING PLAN");
  for (const row of plan) {
    lines.push(
      row.available
        ? `${row.player.name} — available`
        : `${row.player.name} — resting (${row.last?.pitches || 0} on ${row.last?.date || "—"}, back ${row.readyOn})`,
    );
  }
  return lines.join("\n");
}

export function emergencyCardText(player: OsPlayer, team: OsTeam): string {
  const e = player.emergency || {
    allergies: "",
    conditions: "",
    insurer: "",
    policyNo: "",
    physician: "",
    pickup: [],
    notes: "",
  };
  const parents = (player.parents || [])
    .map((p) => `${p.name} (${p.rel}) ${p.phone || ""}`.trim())
    .join("\n");
  return [
    `${player.name} · #${player.number} · ${team.name}`,
    e.allergies ? `ALLERGIES: ${e.allergies}` : "Allergies: none listed",
    e.conditions ? `CONDITIONS: ${e.conditions}` : "Conditions: none listed",
    `Insurance: ${e.insurer || "—"} ${e.policyNo || ""}`.trim(),
    `Physician: ${e.physician || "—"}`,
    `Pickup: ${(e.pickup || []).join(", ") || "—"}`,
    parents ? `Guardians:\n${parents}` : "Guardians: none on file",
  ].join("\n");
}

export function agePitchMax(age: string): number {
  return (PITCH_LIMIT as Record<string, number>)[age] || 95;
}

export function applyLogPitch(
  club: ClubOs,
  teamId: string,
  playerId: string,
  pitches: number,
  date: string,
  event: string,
  actor: string,
): { ok: boolean; warn: boolean; max: number } {
  const team = club.teams.find((t) => t.id === teamId);
  const player = team?.roster.find((p) => p.id === playerId);
  if (!team || !player) return { ok: false, warn: false, max: 0 };
  const max = agePitchMax(team.age);
  const count = Math.max(0, Number(pitches) || 0);
  const warn = count > max;
  if (!team.pitchLog) team.pitchLog = [];
  team.pitchLog.unshift({
    id: uid(),
    playerId,
    date: date || iso(TODAY),
    pitches: count,
    event: event || "",
  });
  logAudit(club, actor, "pitch-log", `${player.name} ${count} pitches${warn ? " OVER MAX" : ""}`);
  return { ok: true, warn, max };
}

export function applyMarkAttendance(
  club: ClubOs,
  teamId: string,
  sessionId: string,
  playerId: string,
  mark: OsAttend,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  if (!team.attendance) team.attendance = {};
  if (!team.attendance[sessionId]) team.attendance[sessionId] = {};
  team.attendance[sessionId][playerId] = mark;
  return club;
}

export function attendancePct(team: OsTeam, playerId: string): number | null {
  const sessions = Object.keys(team.attendance || {});
  if (!sessions.length) return null;
  let inBuilding = 0;
  let counted = 0;
  for (const id of sessions) {
    const v = team.attendance[id]?.[playerId];
    if (!v) continue;
    counted += 1;
    if (v === "present" || v === "late") inBuilding += 1;
  }
  if (!counted) return null;
  return Math.round((inBuilding / counted) * 100);
}

export function applyAnnouncement(
  club: ClubOs,
  teamId: string,
  input: {
    title: string;
    body: string;
    arrive?: string;
    uniform?: string;
    hotel?: string;
    pin?: boolean;
    actor: string;
  },
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  const row = {
    id: uid(),
    title: input.title.trim() || "Note",
    body: input.body.trim(),
    pin: Boolean(input.pin),
    arrive: input.arrive || "",
    uniform: input.uniform || "",
    hotel: input.hotel || "",
  };
  if (!team.announcements) team.announcements = [];
  if (row.pin) team.announcements.forEach((a) => (a.pin = false));
  team.announcements.unshift(row);
  notify(club, team.id, row.title, row.body || "New announcement.", "announce", "all");
  logAudit(club, input.actor, "announce", row.title);
  return club;
}

export function applyFieldCall(
  club: ClubOs,
  input: {
    teamId: string;
    practiceId?: string | null;
    status: OsFieldStatus;
    note?: string;
    newDate?: string;
    newTime?: string;
    newPlace?: string;
    actor: string;
  },
): ClubOs {
  const team = club.teams.find((t) => t.id === input.teamId);
  if (!team) return club;
  const practice = input.practiceId
    ? (team.practices || []).find((p) => p.id === input.practiceId)
    : (team.practices || [])[0];
  if (practice && input.status === "moved") {
    if (input.newDate) practice.date = input.newDate;
    if (input.newTime) practice.time = input.newTime;
    if (input.newPlace) {
      practice.place = input.newPlace;
      practice.where = input.newPlace;
    }
    practice.note = input.note || practice.note;
  }
  if (practice && (input.status === "cancelled" || input.status === "delayed" || input.status === "on")) {
    practice.note = [FIELD_STATUS_LABEL[input.status], input.note].filter(Boolean).join(" · ");
  }
  if (!club.fieldCalls) club.fieldCalls = [];
  const call: OsFieldCall = {
    id: uid(),
    teamId: team.id,
    practiceId: practice?.id ?? null,
    status: input.status,
    at: iso(TODAY),
    note: input.note || "",
    newDate: input.newDate || null,
    newTime: input.newTime || null,
    newPlace: input.newPlace || null,
  };
  club.fieldCalls.unshift(call);
  const where = input.newPlace || practice?.place || practice?.where || "TBD";
  const when = input.newDate || practice?.date || "";
  const title = `${team.name} ${FIELD_STATUS_LABEL[input.status].toLowerCase()}`;
  const body =
    input.status === "moved"
      ? `${team.name} is moved to ${where}${when ? ` on ${when}` : ""}${input.newTime ? ` at ${input.newTime}` : ""}.`
      : input.status === "cancelled"
        ? `${team.name} is cancelled${practice ? ` (${practice.date} ${practice.time})` : ""}.`
        : input.status === "delayed"
          ? `${team.name} is delayed. Hold tight.`
          : `${team.name} is back on. ${practice ? `${practice.date} ${practice.time}` : ""}`.trim();
  notify(club, team.id, title, input.note || body, "field", "all");
  logAudit(club, input.actor, "field-call", `${input.status} ${team.name}`);
  return club;
}

export function applyMoneyNotice(club: ClubOs, teamId: string, title: string, body: string): ClubOs {
  notify(club, teamId, title, body, "money", "admin");
  return club;
}

export function applyChat(
  club: ClubOs,
  teamId: string,
  input: { author: string; role: string; text: string; toPlayerId?: string | null },
): { ok: boolean; reason?: "dm" | "empty" | "missing" } {
  if (input.toPlayerId) return { ok: false, reason: "dm" };
  const text = String(input.text || "").trim();
  if (!text) return { ok: false, reason: "empty" };
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return { ok: false, reason: "missing" };
  if (!team.messages) team.messages = [];
  team.messages.push({
    id: uid(),
    author: input.author,
    role: input.role,
    ts: Date.now(),
    text,
  });
  return { ok: true };
}

export function applyAddPractice(
  club: ClubOs,
  teamId: string,
  input: { date: string; time: string; place: string; note?: string; cageHours?: number; actor: string },
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  if (!team.practices) team.practices = [];
  team.practices.push({
    id: uid(),
    date: input.date,
    time: input.time,
    place: input.place,
    where: input.place,
    note: input.note || "",
    dur: 2,
  });
  if (input.cageHours && input.cageHours > 0) {
    applyBookCage(club, {
      scope: "team",
      ownerId: team.id,
      hours: input.cageHours,
      actor: input.actor,
    });
  }
  notify(
    club,
    team.id,
    "Practice posted",
    `${input.date} ${input.time} at ${input.place}.`,
    "practice",
    "all",
  );
  logAudit(club, input.actor, "practice", `${input.date} ${input.place}`);
  return club;
}

export function applyBookCage(
  club: ClubOs,
  input: {
    scope: "team" | "player";
    ownerId: string;
    hours: number;
    week?: string;
    noShow?: boolean;
    actor: string;
  },
): { ok: boolean; overage: boolean; used: number; allowance: number } {
  const week = input.week || weekSunday();
  const hours = Math.max(0.5, Number(input.hours) || 0);
  const team =
    input.scope === "team"
      ? club.teams.find((t) => t.id === input.ownerId)
      : club.teams.find((t) => t.roster.some((p) => p.id === input.ownerId));
  const allowance =
    input.scope === "team"
      ? Number(team?.teamCageHoursPerWeek) || 0
      : Number(team?.playerCageHoursPerWeek) || 0;
  const used = Number(creditsUsed(club, input.scope, input.ownerId, week)) || 0;
  const overage = !input.noShow && used + hours > allowance;
  if (!club.bookings) club.bookings = [];
  club.bookings.push({
    scope: input.scope,
    ownerId: input.ownerId,
    week,
    hours,
    overage,
    noShow: Boolean(input.noShow),
  });
  logAudit(
    club,
    input.actor,
    input.noShow ? "cage-noshow" : "cage-book",
    `${input.scope} ${input.ownerId} ${hours}h${overage ? " overage" : ""}${input.noShow ? " no-show" : ""}`,
  );
  return { ok: true, overage, used: used + hours, allowance };
}

export function applyMarkNoShow(
  club: ClubOs,
  input: { scope: "team" | "player"; ownerId: string; week?: string; actor: string },
): { ok: boolean } {
  const week = input.week || weekSunday();
  const rows = (club.bookings || []).filter(
    (b) => b.scope === input.scope && b.ownerId === input.ownerId && b.week === week && !b.noShow,
  );
  const last = rows[rows.length - 1];
  if (!last) return { ok: false };
  last.noShow = true;
  last.overage = false;
  logAudit(club, input.actor, "cage-noshow", `${input.scope} ${input.ownerId} ${last.hours}h`);
  return { ok: true };
}

export function cageWeekSummary(
  club: ClubOs,
  scope: "team" | "player",
  ownerId: string,
  week = weekSunday(),
) {
  const rows = (club.bookings || []).filter(
    (b) => b.scope === scope && b.ownerId === ownerId && b.week === week,
  );
  const used = rows.filter((b) => !b.overage && !b.noShow).reduce((a, b) => a + (Number(b.hours) || 0), 0);
  const overage = rows.filter((b) => b.overage && !b.noShow).reduce((a, b) => a + (Number(b.hours) || 0), 0);
  const noShow = rows.filter((b) => b.noShow).reduce((a, b) => a + (Number(b.hours) || 0), 0);
  return { used, overage, noShow, rows };
}

export function applyStartGame(
  club: ClubOs,
  teamId: string,
  input: { opponent: string; event?: string; field?: string; time?: string; actor: string },
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return club;
  if (!club.games) club.games = [];
  club.games.unshift({
    id: uid(),
    teamId: team.id,
    status: "live",
    inning: "T1",
    opponent: input.opponent.trim() || "Opponent",
    oppRuns: 0,
    ourRuns: 0,
    event: input.event || team.seasonLabel,
    field: input.field || "TBD",
    date: iso(TODAY),
    time: input.time || "TBD",
    recap: "",
    line: [],
    live: {
      half: "Top",
      inning: 1,
      outs: 0,
      balls: 0,
      strikes: 0,
      bases: { first: null, second: null, third: null },
      batting: "them",
      pitcher: { name: team.headCoach, num: 0, pitches: 0 },
      batter: { name: "", line: "" },
      onDeck: "",
      inHole: "",
      lastPlay: "Game started.",
      bullpen: [],
    },
  });
  notify(club, team.id, "Game live", `${team.name} vs ${input.opponent}.`, "game", "all");
  logAudit(club, input.actor, "game-start", input.opponent);
  return club;
}

export function applyTapRun(club: ClubOs, gameId: string, who: "us" | "them"): ClubOs {
  const game = (club.games || []).find((g) => g.id === gameId);
  if (!game || game.status !== "live") return club;
  if (who === "us") game.ourRuns = (Number(game.ourRuns) || 0) + 1;
  else game.oppRuns = (Number(game.oppRuns) || 0) + 1;
  if (game.live) {
    game.live.lastPlay = who === "us" ? "Run in." : "Run allowed.";
  }
  return club;
}

export function applyAdvanceHalf(club: ClubOs, gameId: string): ClubOs {
  const game = (club.games || []).find((g) => g.id === gameId);
  if (!game || game.status !== "live" || !game.live) return club;
  if (game.live.half === "Top") {
    game.live.half = "Bottom";
    game.live.batting = "us";
  } else {
    game.live.half = "Top";
    game.live.inning = (Number(game.live.inning) || 1) + 1;
    game.live.batting = "them";
  }
  game.inning = `${game.live.half === "Top" ? "T" : "B"}${game.live.inning}`;
  game.live.outs = 0;
  game.live.lastPlay = `${game.live.half} ${game.live.inning}.`;
  return club;
}

export function applyPostFinal(club: ClubOs, gameId: string, actor: string): ClubOs {
  const game = (club.games || []).find((g) => g.id === gameId);
  if (!game) return club;
  game.status = "final";
  const team = club.teams.find((t) => t.id === game.teamId);
  if (team) {
    if (!team.record) team.record = { w: 0, l: 0, t: 0 };
    if (game.ourRuns > game.oppRuns) team.record.w += 1;
    else if (game.ourRuns < game.oppRuns) team.record.l += 1;
    else team.record.t += 1;
  }
  game.recap = game.recap || `Final ${game.ourRuns}–${game.oppRuns}.`;
  notify(
    club,
    game.teamId,
    "Final",
    `${team?.name || "Team"} ${game.ourRuns}–${game.oppRuns} ${game.opponent}.`,
    "game",
    "all",
  );
  logAudit(club, actor, "game-final", `${game.ourRuns}-${game.oppRuns}`);
  return club;
}

export function telHref(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
}
