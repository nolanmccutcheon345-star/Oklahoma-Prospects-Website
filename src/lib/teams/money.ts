import type { ClubOs, OsPlayer, OsTeam } from "./model";
import { TODAY, addDays, iso, uid } from "./engine/00-helpers.js";
import {
  creditTotal,
  feeDrift,
  lockFee,
  payoffDeadline,
  playerBalance,
  playerFee,
  priceTeam,
} from "./engine/02-pricing.js";
import { logAudit, notify } from "./engine/03-domain.js";

export type OsPayMethod = "card" | "ach";

export type OsPayment = {
  amount: number;
  fee?: number;
  totalCharged?: number;
  method?: OsPayMethod;
  date?: string;
  label?: string;
  receipt?: string;
};

export type OsReenroll = {
  seasonLabel: string;
  earlyBird: number;
  deadline: string;
  status: "offer" | "accepted" | "declined";
};

export type CashMonth = {
  month: string;
  label: string;
  inflow: number;
  entry: number;
  staff: number;
  facility: number;
  uniform: number;
  outflow: number;
  net: number;
  running: number;
};

export function monthKey(value: Date | string): string {
  return iso(value).slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function monthList(start = monthKey(TODAY), count = 12): string[] {
  const [y, m] = start.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const dt = new Date(y, (m || 1) - 1 + i, 1);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function inSeasonMonth(team: OsTeam, month: string): boolean {
  const start = String(team.seasonStart || "").slice(0, 7);
  const end = String(team.seasonEnd || "").slice(0, 7);
  return Boolean(start && end && month >= start && month <= end);
}

export function hasPrimaryCard(player: OsPlayer | null | undefined): boolean {
  return Boolean((player?.cards || []).some((c) => c.primary));
}

export function hasBackupCard(player: OsPlayer | null | undefined): boolean {
  return Boolean((player?.cards || []).some((c) => !c.primary));
}

export function canAutoDraft(player: OsPlayer | null | undefined): boolean {
  return hasPrimaryCard(player) && hasBackupCard(player);
}

export function chargeOf(
  club: ClubOs,
  amount: number,
  method: OsPayMethod,
): { amount: number; fee: number; totalCharged: number; method: OsPayMethod } {
  const n = Math.max(0, Math.round(Number(amount) || 0));
  if (method === "ach") {
    return { amount: n, fee: 0, totalCharged: n, method };
  }
  const pct = club.settings.cardSurchargeEnabled ? Number(club.settings.cardFeePct) || 0 : 0;
  const fee = Math.round(n * (pct / 100));
  return { amount: n, fee, totalCharged: n + fee, method };
}

export function receiptText(player: OsPlayer, team: OsTeam, pay: OsPayment): string {
  const method = pay.method === "ach" ? "Bank draft" : "Card";
  return [
    "Oklahoma Prospects",
    `Receipt ${pay.receipt || "—"}`,
    `${player.name} · ${team.name}`,
    pay.label || "Payment",
    `Date ${pay.date || "—"}`,
    `Method ${method}`,
    `Amount ${pay.amount}`,
    `Fee ${pay.fee ?? 0}`,
    `Total charged ${pay.totalCharged ?? pay.amount}`,
    pay.method === "ach"
      ? "Bank draft is free."
      : "Office-recorded external payment. This entry does not process or charge a card.",
  ].join("\n");
}

export function applyPay(
  club: ClubOs,
  input: {
    teamId: string;
    playerId: string;
    amount: number;
    method: OsPayMethod;
    label?: string;
    actor: string;
  },
): { ok: boolean; reason?: string; charge?: ReturnType<typeof chargeOf>; receipt?: string } {
  const team = club.teams.find((t) => t.id === input.teamId);
  const player = team?.roster.find((p) => p.id === input.playerId);
  if (!team || !player) return { ok: false, reason: "missing" };
  const due = Number(playerBalance(club, team, player)) || 0;
  const amount = Math.min(due, Math.max(0, Math.round(Number(input.amount) || 0)));
  if (amount <= 0) return { ok: false, reason: "empty" };
  const charge = chargeOf(club, amount, input.method);
  const receipt = `R-${uid()}`;
  if (!player.payments) player.payments = [];
  player.payments.push({
    amount: charge.amount,
    fee: charge.fee,
    totalCharged: charge.totalCharged,
    method: charge.method,
    date: iso(TODAY),
    label: input.label || (amount >= due ? "Paid in full" : "Partial payment"),
    receipt,
  });
  if (!player.depositPaid) player.depositPaid = true;
  notify(
    club,
    team.id,
    "Payment",
    `${player.name} ${charge.method === "ach" ? "bank draft" : "card"} ${charge.amount} plus recorded fee ${charge.fee}, external payment recorded ${charge.totalCharged}.`,
    "money",
    "admin",
  );
  logAudit(club, input.actor, "pay", `${player.name} ${charge.totalCharged} ${charge.method}`);
  return { ok: true, charge, receipt };
}

export function applyEnrollDraft(
  club: ClubOs,
  teamId: string,
  playerId: string,
  actor: string,
): { ok: boolean; reason?: "backup" | "missing" } {
  const team = club.teams.find((t) => t.id === teamId);
  const player = team?.roster.find((p) => p.id === playerId);
  if (!team || !player) return { ok: false, reason: "missing" };
  if (!canAutoDraft(player)) return { ok: false, reason: "backup" };
  player.planType = "monthly";
  player.draftEnrolled = true;
  logAudit(club, actor, "draft", `${player.name} monthly auto-draft`);
  notify(
    club,
    team.id,
    "Auto-draft on",
    `${player.name} is on monthly auto-draft.`,
    "money",
    "admin",
  );
  return { ok: true };
}

export function applyAcceptAmendment(
  club: ClubOs,
  teamId: string,
  playerId: string,
  actor: string,
): { ok: boolean } {
  const team = club.teams.find((t) => t.id === teamId);
  const player = team?.roster.find((p) => p.id === playerId);
  if (!team || !player) return { ok: false };
  const pending = (player.amendments || []).find(
    (a) => a.status === "pending" || a.status === "question",
  );
  if (!pending) return { ok: false };
  const agreed = Number(player.feeLock?.amount) || 0;
  player.feeLock = lockFee(club, team, player, club.settings.policy.version);
  pending.status = "accepted";
  logAudit(club, actor, "amend-accept", `${player.name} ${agreed} → ${player.feeLock.amount}`);
  notify(
    club,
    team.id,
    "Amendment accepted",
    `${player.name} accepted the new fee.`,
    "money",
    "admin",
  );
  return { ok: true };
}

export function applyQuestionAmendment(
  club: ClubOs,
  teamId: string,
  playerId: string,
  actor: string,
): { ok: boolean } {
  const team = club.teams.find((t) => t.id === teamId);
  const player = team?.roster.find((p) => p.id === playerId);
  if (!team || !player) return { ok: false };
  const pending = (player.amendments || []).find((a) => a.status === "pending");
  if (!pending) return { ok: false };
  pending.status = "question";
  notify(
    club,
    team.id,
    "Amendment question",
    `${player.name}'s family has a question on the fee change.`,
    "money",
    "admin",
  );
  logAudit(club, actor, "amend-question", player.name);
  return { ok: true };
}

export function applyIssueAmendments(
  club: ClubOs,
  teamId: string,
  playerIds: string[] | "all",
  actor: string,
): { ok: boolean; count: number } {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return { ok: false, count: 0 };
  const targets =
    playerIds === "all"
      ? team.roster.filter((p) => !p.withdrawn && p.feeLock)
      : team.roster.filter((p) => playerIds.includes(p.id));
  let count = 0;
  for (const player of targets) {
    const delta = Number(feeDrift(club, team, player)) || 0;
    if (delta === 0) continue;
    if ((player.amendments || []).some((a) => a.status === "pending")) continue;
    player.amendments = [
      ...(player.amendments || []),
      {
        status: "pending",
        delta,
        note: "Team costs moved after you signed. Accept to update your fee. Nothing changes until you do.",
      },
    ];
    count += 1;
  }
  if (count) {
    notify(
      club,
      team.id,
      "Amendments issued",
      `${count} signed fee${count === 1 ? "" : "s"} need a family decision.`,
      "money",
      "admin",
    );
    logAudit(club, actor, "amend-issue", `${team.name} ${count}`);
  }
  return { ok: true, count };
}

export function applyUploadDoc(
  club: ClubOs,
  teamId: string,
  playerId: string,
  key: string,
  actor: string,
): ClubOs {
  const player = club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === playerId);
  if (!player) return club;
  if (!player.docs) player.docs = {};
  player.docs[key] = true;
  logAudit(club, actor, "doc-upload", `${player.name} ${key}`);
  return club;
}

export function applySetPrefs(
  club: ClubOs,
  teamId: string,
  playerId: string,
  prefs: { email: boolean; sms: boolean },
): ClubOs {
  const player = club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === playerId);
  if (!player) return club;
  player.prefs = { email: Boolean(prefs.email), sms: Boolean(prefs.sms) };
  return club;
}

export function applyReenroll(
  club: ClubOs,
  teamId: string,
  playerId: string,
  status: "accepted" | "declined",
  actor: string,
): ClubOs {
  const player = club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === playerId);
  if (!player || !player.reenroll || typeof player.reenroll !== "object") return club;
  const row = player.reenroll as OsReenroll;
  row.status = status;
  logAudit(club, actor, "reenroll", `${player.name} ${status}`);
  notify(club, teamId, "Re-enrollment", `${player.name} ${status} next season.`, "roster", "admin");
  return club;
}

export function applySetProfile(
  club: ClubOs,
  teamId: string,
  playerId: string,
  input: { enabled: boolean; bio: string },
): ClubOs {
  const player = club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === playerId);
  if (!player) return club;
  const slug =
    player.publicProfile?.slug ||
    player.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  player.publicProfile = {
    enabled: input.enabled,
    bio: input.bio,
    video: player.publicProfile?.video || [],
    slug,
  };
  return club;
}

export function recruitingOnePager(player: OsPlayer, team: OsTeam): string {
  const pos = Array.isArray(player.positions)
    ? player.positions.join(" / ")
    : String(player.positions || "");
  const s = player.stats || {};
  return [
    `${player.name} · #${player.number}`,
    `${team.name} · ${team.age} ${team.level}`,
    pos,
    `Bats ${player.bats} / Throws ${player.throws}`,
    `${player.height} · ${player.weight} · ${player.school} · ${player.gradYear}`,
    player.publicProfile?.bio || "",
    Number(s.avg) ? `AVG ${Number(s.avg).toFixed(3).replace(/^0/, "")}` : "",
    s.velo ? `Velo ${s.velo}` : "",
    "Family contact is not on this sheet.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function recruitingShareUrl(player: OsPlayer): string {
  const slug =
    player.publicProfile?.slug ||
    player.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `https://prospectsbaseball.club/p/${slug}`;
}

export function applyWaiveUniform(
  club: ClubOs,
  teamId: string,
  playerId: string,
  actor: string,
): ClubOs {
  const team = club.teams.find((t) => t.id === teamId);
  const player = team?.roster.find((p) => p.id === playerId);
  if (!team || !player || player.uniformWaived) return club;
  const priced = priceTeam(club, team) as { uniformCost: number };
  const amt = Number(priced.uniformCost) || 0;
  player.uniformWaived = true;
  if (amt > 0) {
    player.credits = [
      ...(player.credits || []),
      {
        id: uid(),
        type: "exception",
        amount: amt,
        note: "Uniform fee waived",
        date: iso(TODAY),
      },
    ];
  }
  logAudit(club, actor, "waive-uniform", player.name);
  notify(
    club,
    team.id,
    "Uniform waived",
    `${player.name}'s uniform fee was waived.`,
    "money",
    "admin",
  );
  return club;
}

export function applyRecordOfficePay(
  club: ClubOs,
  input: { teamId: string; playerId: string; amount: number; method: OsPayMethod; actor: string },
) {
  return applyPay(club, { ...input, label: "Office payment" });
}

function addIn(map: Record<string, number>, month: string, amount: number) {
  map[month] = (map[month] || 0) + Math.max(0, Number(amount) || 0);
}

function remainingDueMonths(
  club: ClubOs,
  team: OsTeam,
  player: OsPlayer,
  left: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (left <= 0) return out;
  const deadline = payoffDeadline(club, team);
  if (player.planType === "full") {
    const when = deadline ? iso(addDays(deadline, -14)) : team.seasonEnd;
    addIn(out, monthKey(when), left);
    return out;
  }
  if (!deadline) {
    addIn(out, monthKey(team.seasonEnd || TODAY), left);
    return out;
  }
  const dates: Date[] = [];
  let cur = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1);
  while (cur <= deadline && dates.length < 12) {
    dates.push(new Date(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  if (!dates.length) {
    addIn(out, monthKey(TODAY), left);
    return out;
  }
  const each = Math.floor((left / dates.length) * 100) / 100;
  dates.forEach((dt, i) => {
    const amt = i === dates.length - 1 ? +(left - each * (dates.length - 1)).toFixed(2) : each;
    addIn(out, monthKey(dt), amt);
  });
  return out;
}

export function cashFlowForTeam(
  club: ClubOs,
  team: OsTeam,
  start = monthKey(TODAY),
): {
  months: CashMonth[];
  low: { month: string; label: string; balance: number };
} {
  const priced = priceTeam(club, team) as {
    evs: { start: string; fee: number }[];
    uniformCost: number;
    coachTotal: number;
  };
  const months = monthList(start, 12);
  const inflow: Record<string, number> = {};
  for (const player of team.roster.filter((p) => !p.withdrawn)) {
    for (const pay of player.payments || []) {
      if (pay.date) addIn(inflow, monthKey(pay.date), Number(pay.amount) || 0);
    }
    const left = Number(playerBalance(club, team, player)) || 0;
    const rest = remainingDueMonths(club, team, player, left);
    for (const [k, v] of Object.entries(rest)) addIn(inflow, k, v);
  }

  const staffMonthly =
    (team.staff || []).length > 0
      ? (team.staff || []).reduce((a, m) => a + (Number(m.monthly) || 0), 0)
      : Number(team.coachMonthly) || 0;
  const facilityMonthly = Number(club.settings.facilityPerTeamMonth) || 0;
  const uniformTotal =
    (Number(priced.uniformCost) || 0) *
    team.roster.filter((p) => !p.withdrawn && !p.uniformWaived).length;
  const uniformMonth = monthKey(team.uniformDeadline || team.seasonStart || TODAY);
  const entryByMonth: Record<string, number> = {};
  for (const ev of priced.evs || []) {
    addIn(entryByMonth, monthKey(ev.start), Number(ev.fee) || 0);
  }

  const rows: CashMonth[] = [];
  let running = 0;
  let low = { month: months[0], label: monthLabel(months[0]), balance: 0 };
  for (const month of months) {
    const inAmt = inflow[month] || 0;
    const entry = entryByMonth[month] || 0;
    const staff = inSeasonMonth(team, month) ? staffMonthly : 0;
    const facility = inSeasonMonth(team, month) ? facilityMonthly : 0;
    const uniform = month === uniformMonth ? uniformTotal : 0;
    const outflow = entry + staff + facility + uniform;
    const net = inAmt - outflow;
    running += net;
    const row: CashMonth = {
      month,
      label: monthLabel(month),
      inflow: inAmt,
      entry,
      staff,
      facility,
      uniform,
      outflow,
      net,
      running,
    };
    rows.push(row);
    if (running < low.balance) {
      low = { month, label: row.label, balance: running };
    }
  }
  return { months: rows, low };
}

export function valueOfAnotherPlayer(club: ClubOs, team: OsTeam): number {
  const priced = priceTeam(club, team) as { published: number; uniformCost: number };
  return Math.max(0, (Number(priced.published) || 0) - (Number(priced.uniformCost) || 0));
}

export function ownerSplit(margin: number): number {
  return Math.round((Number(margin) || 0) / 2);
}

export function marginIsForecast(team: OsTeam | null | undefined): boolean {
  return !team?.closed;
}

export function marginAmount(club: ClubOs, team: OsTeam): { amount: number; forecast: boolean } {
  const priced = priceTeam(club, team) as { forecastMargin: number; realizedMargin: number | null };
  if (team.closed && priced.realizedMargin != null) {
    return { amount: Number(priced.realizedMargin) || 0, forecast: false };
  }
  return { amount: Number(priced.forecastMargin) || 0, forecast: true };
}

export function applyCloseSeason(
  club: ClubOs,
  teamId: string,
  actuals: Record<string, number>,
  actor: string,
): { ok: boolean; realized: number } {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return { ok: false, realized: 0 };
  const priced = priceTeam(club, team) as {
    revenue: number;
    sponsorIncome: number;
    creditsGiven: number;
    forecastMargin: number;
  };
  const spend = Object.values(actuals).reduce((a, b) => a + (Number(b) || 0), 0);
  const realized = Math.round(priced.revenue + priced.sponsorIncome - priced.creditsGiven - spend);
  team.actuals = { ...actuals };
  team.closed = { realizedMargin: realized };
  if (!club.archive) club.archive = [];
  club.archive.push({
    teamId: team.id,
    name: team.name,
    seasonLabel: team.seasonLabel,
    closedAt: iso(TODAY),
    realized,
    record: team.record,
    roster: team.roster.map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      stats: p.stats,
    })),
  });
  logAudit(club, actor, "season-close", `${team.name} realized ${realized}`);
  notify(
    club,
    team.id,
    "Season closed",
    `${team.name} is archived. Margin is realized.`,
    "money",
    "admin",
  );
  return { ok: true, realized };
}

export function collectionsOf(club: ClubOs, team?: OsTeam | null) {
  const teams = team ? [team] : club.teams;
  const deadline = (t: OsTeam) => {
    try {
      return payoffDeadline(club, t);
    } catch {
      return null;
    }
  };
  const rows = teams.flatMap((t) => {
    const dl = deadline(t);
    return t.roster
      .filter((p) => !p.withdrawn)
      .map((p) => {
        const balance = Number(playerBalance(club, t, p)) || 0;
        const pastDue = Boolean(dl && balance > 0 && TODAY > dl);
        return {
          team: t,
          player: p,
          balance,
          pastDue,
          depositPaid: Boolean(p.depositPaid),
          backup: hasBackupCard(p),
          unsigned: !p.agreement,
        };
      })
      .filter((r) => r.balance > 0 || !r.depositPaid);
  });
  rows.sort((a, b) => {
    if (a.pastDue !== b.pastDue) return a.pastDue ? -1 : 1;
    return b.balance - a.balance;
  });
  return rows;
}

export type CollectionFilter = "all" | "pastDue" | "noDeposit" | "noBackup";

export function matchesCollection(
  row: ReturnType<typeof collectionsOf>[number],
  filter: CollectionFilter,
) {
  if (filter === "pastDue") return row.pastDue;
  if (filter === "noDeposit") return !row.depositPaid;
  if (filter === "noBackup") return !row.backup;
  return true;
}

export function moneyCopyLeak(text: string): boolean {
  return /\$|usd|\bbudget\b|% of budget|entry fee/i.test(String(text || ""));
}
