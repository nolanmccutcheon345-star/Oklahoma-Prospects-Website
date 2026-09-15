import type { ClubOs, OsLead, OsPlayer, OsTeam } from "./model";
import { TODAY, iso, uid } from "./engine/00-helpers.js";
import { playerBalance, playerFee, priceTeam } from "./engine/02-pricing.js";
import { logAudit, notify } from "./engine/03-domain.js";

function teamMargin(club: ClubOs, team: OsTeam) {
  const priced = priceTeam(club, team) as { forecastMargin: number; realizedMargin: number | null };
  if (team.closed && priced.realizedMargin != null) {
    return { amount: Number(priced.realizedMargin) || 0, forecast: false };
  }
  return { amount: Number(priced.forecastMargin) || 0, forecast: true };
}

export const FILL_TARGET = 14;
export const GRADE_KEYS = ["hit", "power", "run", "arm", "field", "makeup"] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];
export const LEAD_STAGES = [
  "lead",
  "registered",
  "evaluated",
  "offer",
  "accepted",
  "waitlist",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const POLICY_LAWYER_NOTE =
  "Starting point for a lawyer to review, not legal advice.";

const DEFAULT_POLICY =
  "1. The roster deposit reserves a spot and is non-refundable once paid.\n" +
  "2. Once the schedule is committed, the full season fee is owed whether or not the player participates.\n" +
  "3. Withdrawal before the schedule commits owes the deposit only.\n" +
  "4. Withdrawal after owes the full balance; uniform items already ordered remain the family's.\n" +
  "5. Balances clear six weeks before the first tournament or the spot is forfeit without refund.\n" +
  "6. Fees fund team operations. Unused team budget is not distributed to families.\n" +
  "7. Cancellations outside the club's control are replaced where possible; unreplaceable entry fees are credited.";

export function clampGrade(value: unknown) {
  const n = Math.round(Number(value) || 0);
  if (n <= 0) return 0;
  return Math.max(20, Math.min(80, n));
}

export function stageOf(lead: OsLead): LeadStage {
  const s = String(lead.status || "lead");
  return (LEAD_STAGES as readonly string[]).includes(s) ? (s as LeadStage) : "lead";
}

export function applySetLeadStage(
  club: ClubOs,
  leadId: string,
  status: LeadStage,
  actor: string,
): { ok: boolean } {
  const lead = club.leads.find((l) => l.id === leadId);
  if (!lead) return { ok: false };
  lead.status = status;
  logAudit(club, actor, "lead-stage", `${lead.name} → ${status}`);
  return { ok: true };
}

export function applySetLeadScores(
  club: ClubOs,
  leadId: string,
  scores: Partial<Record<GradeKey, number>>,
  actor: string,
): { ok: boolean } {
  const lead = club.leads.find((l) => l.id === leadId);
  if (!lead) return { ok: false };
  const next = { ...(lead.scores || {}) };
  for (const key of GRADE_KEYS) {
    if (scores[key] != null) next[key] = clampGrade(scores[key]);
  }
  lead.scores = next;
  if (stageOf(lead) === "lead" || stageOf(lead) === "registered") {
    lead.status = "evaluated";
  }
  logAudit(club, actor, "lead-eval", `${lead.name} graded.`);
  return { ok: true };
}

export function applyMakeOffer(
  club: ClubOs,
  leadId: string,
  teamId: string,
  actor: string,
): { ok: boolean; inviteId?: string; reason?: string } {
  const lead = club.leads.find((l) => l.id === leadId);
  const team = club.teams.find((t) => t.id === teamId);
  if (!lead || !team) return { ok: false, reason: "missing" };
  const inviteId = uid();
  team.invites = team.invites || [];
  team.invites.unshift({
    id: inviteId,
    name: lead.name,
    email: lead.email,
    position: lead.position || "",
    sent: iso(TODAY),
    status: "sent",
  });
  lead.status = "offer";
  lead.teamId = team.id;
  lead.note = lead.note
    ? `${lead.note} Offered ${team.name}.`
    : `Offered ${team.name}.`;
  logAudit(club, actor, "lead-offer", `${lead.name} offered ${team.name}. Invite ${inviteId}.`);
  notify(
    club,
    team.id,
    "Tryout offer",
    `${lead.name} has an invite on ${team.name}. Signing starts from that invite.`,
    "roster",
    "all",
  );
  return { ok: true, inviteId };
}

export function applyWaitlist(club: ClubOs, leadId: string, actor: string) {
  return applySetLeadStage(club, leadId, "waitlist", actor);
}

export function applyAcceptLead(club: ClubOs, leadId: string, actor: string) {
  const lead = club.leads.find((l) => l.id === leadId);
  if (!lead) return { ok: false };
  lead.status = "accepted";
  logAudit(club, actor, "lead-accept", `${lead.name} accepted.`);
  return { ok: true };
}

export function applyRegisterLead(
  club: ClubOs,
  input: { name: string; email: string; phone?: string; ageGroup?: string; position?: string; sport?: string },
  actor: string,
) {
  const lead: OsLead = {
    id: uid(),
    name: input.name.trim(),
    email: input.email.trim(),
    phone: input.phone || "",
    gradYear: 2031,
    position: input.position || "",
    sport: input.sport || "baseball",
    ageGroup: input.ageGroup || "",
    source: "Tryout",
    status: "registered",
    scores: {},
    note: "",
  };
  club.leads.unshift(lead);
  logAudit(club, actor, "lead-register", `${lead.name} registered.`);
  return { ok: true, id: lead.id };
}

export function funnelOf(club: ClubOs) {
  const counts: Record<LeadStage, number> = {
    lead: 0,
    registered: 0,
    evaluated: 0,
    offer: 0,
    accepted: 0,
    waitlist: 0,
  };
  for (const lead of club.leads || []) {
    counts[stageOf(lead)] += 1;
  }
  const entered = (club.leads || []).length;
  const accepted = counts.accepted;
  return {
    counts,
    entered,
    accepted,
    conversion: entered > 0 ? accepted / entered : 0,
  };
}

export function tryoutLink() {
  return "https://prospectsbaseball.club/tryouts";
}

export function alumniPublic(
  rows: { kind: string }[] | null | undefined,
): { kind: string; label: string; count: number }[] {
  const list = rows || [];
  const college = list.filter((a) => a.kind === "college").length;
  const draft = list.filter((a) => a.kind === "draft").length;
  const pro = list.filter((a) => a.kind === "pro" || a.kind === "signing").length;
  return [
    college > 0 ? { kind: "college", label: "College commitments", count: college } : null,
    draft > 0 ? { kind: "draft", label: "Draft picks", count: draft } : null,
    pro > 0 ? { kind: "pro", label: "Pro signings", count: pro } : null,
  ].filter((x): x is { kind: string; label: string; count: number } => Boolean(x));
}

function n(value: unknown) {
  return Number(value) || 0;
}

function activeRoster(team: OsTeam) {
  return team.roster.filter((p) => !p.withdrawn);
}

function collectionRate(club: ClubOs, team: OsTeam) {
  const players = activeRoster(team);
  let fee = 0;
  let paid = 0;
  for (const p of players) {
    fee += n(playerFee(club, team, p));
    paid += (p.payments || []).reduce((a, x) => a + n(x.amount), 0);
  }
  if (fee <= 0) return 1;
  return paid / fee;
}

function attendanceRate(team: OsTeam) {
  const marks = Object.values(team.attendance || {});
  let total = 0;
  let here = 0;
  for (const session of marks) {
    for (const mark of Object.values(session || {})) {
      total += 1;
      if (mark === "present" || mark === "late") here += 1;
    }
  }
  if (total <= 0) return null;
  return here / total;
}

function retentionRate(team: OsTeam) {
  const offers = activeRoster(team).filter((p) => {
    const r = p.reenroll;
    return r && typeof r === "object" && "status" in r;
  });
  if (!offers.length) return null;
  const kept = offers.filter((p) => {
    const r = p.reenroll as { status?: string };
    return r.status === "accepted";
  }).length;
  return kept / offers.length;
}

function midSeasonWithdrawals(team: OsTeam) {
  return team.roster.filter((p) => Boolean(p.withdrawn)).length;
}

export type Scorecard = {
  team: OsTeam;
  name: string;
  role: string;
  fill: number;
  fillPct: number;
  collection: number;
  attendance: number | null;
  retention: number | null;
  withdrawals: number;
  events: number;
  record: { w: number; l: number; t: number };
  flagWithdrawals: boolean;
  flagCollections: boolean;
};

export function scorecardFor(club: ClubOs, team: OsTeam, member?: { name: string; role: string } | null): Scorecard {
  const fill = activeRoster(team).length;
  const collection = collectionRate(club, team);
  const withdrawals = midSeasonWithdrawals(team);
  const head = (team.staff || []).find((m) => m.role === "Head coach");
  return {
    team,
    name: member?.name || head?.name || team.headCoach,
    role: member?.role || "Head coach",
    fill,
    fillPct: fill / FILL_TARGET,
    collection,
    attendance: attendanceRate(team),
    retention: retentionRate(team),
    withdrawals,
    events: (team.tournamentIds || []).length,
    record: team.record || { w: 0, l: 0, t: 0 },
    flagWithdrawals: withdrawals > 1,
    flagCollections: collection < 0.7,
  };
}

export function scorecardsOf(club: ClubOs): Scorecard[] {
  return club.teams.map((t) => scorecardFor(club, t));
}

export function analyticsOf(club: ClubOs) {
  const cards = scorecardsOf(club);
  const players = club.teams.reduce((a, t) => a + activeRoster(t).length, 0);
  const fill = club.teams.length ? players / (club.teams.length * FILL_TARGET) : 0;
  const collection =
    cards.length === 0
      ? 0
      : cards.reduce((a, c) => a + c.collection, 0) / cards.length;
  const margins = club.teams.map((t) => {
    const m = teamMargin(club, t);
    const roster = Math.max(1, activeRoster(t).length);
    return { team: t, margin: m.amount, perPlayer: m.amount / roster, forecast: m.forecast };
  });
  const funnel = funnelOf(club);
  const spend = n(club.settings.acquisitionSpend);
  const cpa = funnel.accepted > 0 ? spend / funnel.accepted : null;
  const retentionRows = cards.filter((c) => c.retention != null);
  const retention =
    retentionRows.length === 0
      ? null
      : retentionRows.reduce((a, c) => a + (c.retention || 0), 0) / retentionRows.length;
  return { cards, fill, collection, margins, funnel, cpa, spend, retention, players };
}

export type OsArchiveRow = {
  teamId: string;
  name: string;
  seasonLabel: string;
  closedAt: string;
  realized: number;
  record?: { w: number; l: number; t: number };
  roster: { id: string; name: string; number: number | string; stats: OsPlayer["stats"] }[];
};

export function archivesOf(club: ClubOs): OsArchiveRow[] {
  return (club.archive || []) as OsArchiveRow[];
}

export function archiveExport(club: ClubOs): string {
  const rows = archivesOf(club);
  const lines = ["season,team,closed,realized,w,l,t,roster"];
  for (const row of rows) {
    const rec = row.record || { w: 0, l: 0, t: 0 };
    const names = (row.roster || []).map((p) => `${p.name} #${p.number}`).join("|");
    lines.push(
      [
        row.seasonLabel,
        row.name,
        row.closedAt,
        row.realized,
        rec.w,
        rec.l,
        rec.t,
        names,
      ].join(","),
    );
  }
  return lines.join("\n");
}

export function agreementsOf(club: ClubOs) {
  const current = Number(club.settings.policy?.version) || 1;
  const signed: { team: OsTeam; player: OsPlayer; version: number | string }[] = [];
  const unsigned: { team: OsTeam; player: OsPlayer }[] = [];
  for (const team of club.teams) {
    for (const player of activeRoster(team)) {
      if (player.agreement) {
        signed.push({ team, player, version: player.agreement.version });
      } else {
        unsigned.push({ team, player });
      }
    }
  }
  return { current, signed, unsigned, policy: club.settings.policy };
}

export function applyChaseAgreements(club: ClubOs, actor: string) {
  const { unsigned } = agreementsOf(club);
  const byTeam = new Map<string, string[]>();
  for (const row of unsigned) {
    const list = byTeam.get(row.team.id) || [];
    list.push(row.player.name);
    byTeam.set(row.team.id, list);
  }
  byTeam.forEach((names, teamId) => {
    const team = club.teams.find((t) => t.id === teamId);
    const who = names.length <= 3 ? names.join(", ") : `${names.length} families`;
    notify(
      club,
      teamId,
      "Agreement chase",
      `${who} on ${team?.name || "a team"} still need to sign. The roster spot is not locked until they do.`,
      "chase",
      "all",
    );
  });
  logAudit(club, actor, "agreement-chase", `Chased ${unsigned.length} unsigned agreements.`);
  return { ok: true, count: unsigned.length };
}

export function applyPublishPolicy(club: ClubOs, text: string, actor: string) {
  const body = String(text || "").trim() || DEFAULT_POLICY;
  const prev = Number(club.settings.policy?.version) || 1;
  club.settings.policy = {
    ...club.settings.policy,
    version: prev + 1,
    text: body,
  };
  logAudit(club, actor, "policy-publish", `Policy v${prev + 1} published. Existing signatures stay on v${prev}.`);
  notify(
    club,
    "",
    "Policy published",
    `Version ${prev + 1} is current. Families who already signed stay on the version they agreed to.`,
    "info",
    "admin",
  );
  return { ok: true, version: prev + 1 };
}

export { DEFAULT_POLICY };

/** Used by close-season so the archive always carries the record. */
export function withRecord(team: OsTeam) {
  return team.record || { w: 0, l: 0, t: 0 };
}

export function pricedMargin(club: ClubOs, team: OsTeam) {
  const priced = priceTeam(club, team) as { forecastMargin: number; realizedMargin: number | null };
  return team.closed && priced.realizedMargin != null
    ? n(priced.realizedMargin)
    : n(priced.forecastMargin);
}

export function playerBalanceSafe(club: ClubOs, team: OsTeam, player: OsPlayer) {
  return n(playerBalance(club, team, player));
}
