import type {
  ClubOs,
  OsAlert,
  OsIdentity,
  OsPlayer,
  OsRole,
  OsStaff,
  OsTeam,
  OsViewer,
} from "./model.ts";
import { eventById, playerFee, priceTeam, staffCash, staffSeasonPay } from "./engine/02-pricing.js";
import { creditsUsed } from "./engine/03-domain.js";
import { weekSunday } from "./field.ts";

/** Keys that are payment data. Absent for a coach — not empty, deleted. */
export const PLAYER_PAYMENT_KEYS = [
  "payments",
  "cards",
  "credits",
  "feeLock",
  "planLock",
  "depositCharge",
  "amendments",
] as const;

const MONEY_SETTINGS = [
  "membershipMonthly",
  "facilityPerTeamMonth",
  "orgFeeMin",
  "orgFeeMax",
  "coachMin",
  "coachMax",
  "cageHourlyRate",
  "acquisitionSpend",
  "contingencyPct",
  "poTeamCostPct",
  "sponsorCreditPct",
] as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function drop<T extends object>(row: T, keys: readonly string[]): T {
  const next = { ...row } as T & Record<string, unknown>;
  for (const key of keys) delete next[key];
  return next;
}

function blankEmergency(player: OsPlayer): OsPlayer["emergency"] {
  return {
    allergies: "",
    conditions: "",
    insurer: "",
    policyNo: "",
    physician: "",
    pickup: [],
    notes: "",
  };
}

function publicTeammate(player: OsPlayer): OsPlayer {
  const next = drop(player, PLAYER_PAYMENT_KEYS);
  next.emergency = blankEmergency(player);
  next.parents = (player.parents || []).map((p) => ({
    ...p,
    phone: "",
    email: "",
  }));
  return next;
}

function coachRosterPlayer(player: OsPlayer): OsPlayer {
  // Keep emergency and parent contact — the coach has to reach this family at 9:15.
  // Strip every dollar on the player object. Own-child fee lives on the viewer, not here.
  return drop(player, PLAYER_PAYMENT_KEYS);
}

function playerSelf(player: OsPlayer): OsPlayer {
  const next = drop(player, PLAYER_PAYMENT_KEYS);
  next.depositPaid = Boolean(player.depositPaid);
  return next;
}

function zeroTeamMoney(team: OsTeam, keep: { eventBudget?: boolean; travel?: boolean; ownStaffId?: string | null }): OsTeam {
  const other: Record<string, number> = {};
  if (keep.travel) other.travel = Number(team.otherCosts?.travel) || 0;
  else {
    for (const key of Object.keys(team.otherCosts || {})) other[key] = 0;
  }
  return {
    ...team,
    orgFee: 0,
    coachMonthly: 0,
    eventBudget: keep.eventBudget ? team.eventBudget : 0,
    otherCosts: other,
    actuals: null,
    closed: null,
    sponsors: (team.sponsors || []).map((s) => ({ ...s, amount: 0 })),
    staff: team.staff.map((m) =>
      keep.ownStaffId && m.id === keep.ownStaffId
        ? m
        : { ...m, monthly: 0, applyAmount: 0 },
    ),
  };
}

function ownStaff(team: OsTeam, email: string): OsStaff | null {
  if (team.coachEmail === email) {
    return team.staff.find((m) => m.role === "Head coach") ?? team.staff[0] ?? null;
  }
  return (
    team.staff.find((m) => m.email && m.email.toLowerCase() === email.toLowerCase()) ??
    null
  );
}

function weekOf(): string {
  return weekSunday();
}

function buildViewer(raw: ClubOs, identity: OsIdentity): OsViewer {
  const publishedByTeam: OsViewer["publishedByTeam"] = {};
  const entryByTeam: OsViewer["entryByTeam"] = {};
  const travelByTeam: OsViewer["travelByTeam"] = {};
  const cageByTeam: OsViewer["cageByTeam"] = {};
  const eventShareByTeam: OsViewer["eventShareByTeam"] = {};
  let ownPay: OsViewer["ownPay"] = null;
  let ownChild: OsViewer["ownChild"] = null;
  const wk = weekOf();

  for (const team of raw.teams) {
    try {
      const priced = priceTeam(raw, team) as { published: number; entryFees: number };
      publishedByTeam[team.id] = Number(priced.published) || 0;
      const budget = Number(team.eventBudget) || 0;
      const spent = Number(priced.entryFees) || 0;
      entryByTeam[team.id] = {
        budget,
        spent,
        pct: budget > 0 ? Math.round((spent / budget) * 100) : 0,
      };
    } catch {
      publishedByTeam[team.id] = 0;
      entryByTeam[team.id] = { budget: Number(team.eventBudget) || 0, spent: 0, pct: 0 };
    }
    const travelBudget = Number(team.otherCosts?.travel) || 0;
    const reimbursed = (raw.reimbursements || [])
      .filter((r) => r.teamId === team.id)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    travelByTeam[team.id] = { budget: travelBudget, reimbursed };
    const used = Number(creditsUsed(raw, "team", team.id, wk)) || 0;
    cageByTeam[team.id] = { teamHours: Number(team.teamCageHoursPerWeek) || 0, used };
    const budget = Number(team.eventBudget) || 0;
    const shares: Record<string, number> = {};
    for (const ev of raw.catalog || []) {
      shares[ev.id] = budget > 0 ? Math.round(((Number(ev.fee) || 0) / budget) * 100) : 0;
    }
    eventShareByTeam[team.id] = shares;

    if (identity.role === "coach" && (team.coachEmail === identity.email || team.id === identity.teamId)) {
      const me = ownStaff(team, identity.email);
      if (me) {
        ownPay = {
          teamId: team.id,
          season: Number(staffSeasonPay(team, me)) || 0,
          cash: Number(staffCash(team, me)) || 0,
          monthly: Number(me.monthly) || 0,
        };
        const kid = me.childId ? team.roster.find((p) => p.id === me.childId) : team.roster.find((p) => p.coachChild === "head");
        if (kid) {
          try {
            ownChild = {
              teamId: team.id,
              playerId: kid.id,
              name: kid.name,
              fee: Number(playerFee(raw, team, kid)) || 0,
            };
          } catch {
            ownChild = { teamId: team.id, playerId: kid.id, name: kid.name, fee: 0 };
          }
        }
      }
    }
  }

  return {
    role: identity.role,
    publishedByTeam,
    entryByTeam,
    travelByTeam,
    cageByTeam,
    eventShareByTeam,
    ownPay,
    ownChild,
    membershipIncludes: [...(raw.settings.membershipIncludes || [])],
  };
}

function filterAlerts(raw: ClubOs, identity: OsIdentity, alerts: OsAlert[]): OsAlert[] {
  if (identity.role === "admin") return alerts;
  if (identity.role === "player") {
    return alerts.filter(
      (a) =>
        a.kind !== "Money" &&
        !/\$|usd|\bbudget\b|% of budget|entry fee/i.test(a.text) &&
        a.teamId === identity.teamId,
    );
  }
  if (identity.role === "coach") {
    const mine = new Set(raw.teams.filter((t) => t.id === identity.teamId || t.coachEmail === identity.email).map((t) => t.id));
    return alerts.filter((a) => mine.has(a.teamId) && a.kind !== "Money" && !/\$/.test(a.text));
  }
  const names = new Set(
    raw.teams.flatMap((t) => t.roster.filter((p) => p.familyId === identity.familyId).map((p) => p.name)),
  );
  return alerts.filter((a) => names.size > 0 && [...names].some((n) => a.text.includes(n)));
}

function stripSettings(settings: ClubOs["settings"], role: OsRole): ClubOs["settings"] {
  if (role === "admin") return settings;
  const next = { ...settings };
  for (const key of MONEY_SETTINGS) {
    (next as Record<string, unknown>)[key] = 0;
  }
  if (role === "parent") {
    // New offers include processing for all methods.
    next.cardFeePct = 0;
    next.cardSurchargeEnabled = false;
    next.roundStep = settings.roundStep;
    next.paidInFullWeeks = settings.paidInFullWeeks;
    next.membershipIncludes = settings.membershipIncludes;
    next.policy = settings.policy;
    next.cageHourlyRate = settings.cageHourlyRate;
  }
  if (role === "coach") {
    next.cardFeePct = 0;
    next.membershipIncludes = settings.membershipIncludes;
    next.policy = settings.policy;
  }
  if (role === "player") {
    next.cardFeePct = 0;
    next.cardSurchargeEnabled = false;
    next.membershipIncludes = settings.membershipIncludes;
  }
  return next;
}

/**
 * The data-layer gate. Takes the logged-in identity and returns only what they
 * may hold. Every read in the OS goes through this. When a real backend lands,
 * this function moves to the server unchanged.
 */
export function scopeClub(
  raw: ClubOs,
  identity: OsIdentity,
  alerts: OsAlert[] = [],
): { state: ClubOs; viewer: OsViewer; alerts: OsAlert[] } {
  const viewer = buildViewer(raw, identity);
  const next = clone(raw);

  if (identity.role === "admin") {
    return { state: next, viewer, alerts: filterAlerts(raw, identity, alerts) };
  }

  next.settings = stripSettings(next.settings, identity.role);
  next.leads = [];
  next.payouts = [];
  next.purchaseOrders = [];
  next.audit = [];

  if (identity.role === "coach") {
    next.teams = next.teams
      .filter(
        (team) =>
          team.coachEmail === identity.email ||
          team.id === identity.teamId ||
          team.staff.some((m) => m.email && m.email.toLowerCase() === identity.email),
      )
      .map((team) => {
        const me = ownStaff(team, identity.email);
        const scoped = zeroTeamMoney(team, {
          eventBudget: true,
          travel: true,
          ownStaffId: me?.id ?? null,
        });
        scoped.roster = team.roster.map(coachRosterPlayer);
        return scoped;
      });
    next.games = next.games.filter((g) => next.teams.some((t) => t.id === g.teamId));
    next.reimbursements = (raw.reimbursements || []).filter(
      (r) => r.staffEmail === identity.email || next.teams.some((t) => t.id === r.teamId),
    );
    next.catalog = next.catalog.map((e) => ({ ...e, fee: 0 }));
    next.uniforms = next.uniforms.map((u) => ({ ...u, price: 0 }));
    next.fieldCalls = (raw.fieldCalls || []).filter((c) => next.teams.some((t) => t.id === c.teamId));
    return { state: next, viewer, alerts: filterAlerts(raw, identity, alerts) };
  }

  const familyId = identity.familyId;
  next.teams = next.teams
    .filter((team) => team.roster.some((p) => familyId && p.familyId === familyId && !p.withdrawn))
    .map((team) => {
      const scoped = zeroTeamMoney(team, {});
      scoped.roster = team.roster.map((p) => {
        if (familyId && p.familyId === familyId) {
          return identity.role === "player" ? playerSelf(p) : p;
        }
        return publicTeammate(p);
      });
      return scoped;
    });
  next.games = next.games.filter((g) => next.teams.some((t) => t.id === g.teamId));
  next.reimbursements = [];
  if (identity.role === "parent" || identity.role === "player") {
    next.catalog = next.catalog.map((e) => ({ ...e, fee: 0 }));
    next.uniforms = next.uniforms.map((u) => ({ ...u, price: 0 }));
    next.tryouts = next.tryouts.map((t) => ({ ...t, fee: 0 }));
  }
  next.fieldCalls = (raw.fieldCalls || []).filter((c) => next.teams.some((t) => t.id === c.teamId));
  return { state: next, viewer, alerts: filterAlerts(raw, identity, alerts) };
}

/** Payment keys still hanging on any player — must be empty for a coach payload. */
export function playerPaymentKeysPresent(player: OsPlayer): string[] {
  const found: string[] = [];
  for (const key of PLAYER_PAYMENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(player, key) && (player as Record<string, unknown>)[key] != null) {
      found.push(key);
    }
  }
  return found;
}

export function inspectCoachScope(state: ClubOs): {
  role: "coach";
  players: number;
  paymentKeysFound: string[];
  sample: { id: string; name: string; keys: string[] }[];
} {
  const sample = state.teams.flatMap((t) =>
    t.roster.map((p) => ({
      id: p.id,
      name: p.name,
      keys: playerPaymentKeysPresent(p),
    })),
  );
  return {
    role: "coach",
    players: sample.length,
    paymentKeysFound: [...new Set(sample.flatMap((s) => s.keys))],
    sample,
  };
}

export function moneyFieldsPresent(state: ClubOs): string[] {
  const found: string[] = [];
  const moneyKeys = new Set([
    "fee",
    "price",
    "amount",
    "orgFee",
    "coachMonthly",
    "eventBudget",
    "membershipMonthly",
    "facilityPerTeamMonth",
    "payments",
    "credits",
    "feeLock",
    "planLock",
    "depositCharge",
    "cards",
  ]);
  JSON.stringify(state, (key, value) => {
    if (!moneyKeys.has(key)) return value;
    if (value == null) return value;
    if (Array.isArray(value) && value.length === 0) {
      found.push(key);
      return value;
    }
    if (typeof value === "number" && value !== 0) found.push(`${key}=${value}`);
    if (typeof value === "object") found.push(key);
    return value;
  });
  return found;
}

export function eventByIdRaw(state: ClubOs, id: string | null | undefined) {
  if (!id) return null;
  try {
    return eventById(state, id) ?? null;
  } catch {
    return null;
  }
}

export function osCoachHoldsTeam(club: ClubOs, email: string, teamId: string): boolean {
  const team = club.teams.find((t) => t.id === teamId);
  if (!team) return false;
  const e = email.toLowerCase();
  if (team.coachEmail?.toLowerCase() === e) return true;
  if (team.staff.some((m) => m.email?.toLowerCase() === e)) return true;
  return false;
}

export function osFamilyHoldsPlayer(club: ClubOs, familyId: string | null, playerId: string): boolean {
  if (!familyId) return false;
  return club.teams.some((t) => t.roster.some((p) => p.id === playerId && p.familyId === familyId));
}

/**
 * Fetch-time team gate. A crafted teamId that this identity does not hold
 * returns null — the roster never leaves this function.
 */
export function requestTeam(club: ClubOs, identity: OsIdentity, teamId: string): OsTeam | null {
  const team = club.teams.find((t) => t.id === teamId) ?? null;
  if (!team) return null;
  if (identity.role === "admin") return team;
  if (identity.role === "coach") {
    const holds = osCoachHoldsTeam(club, identity.email, teamId) || team.id === identity.teamId;
    return holds ? team : null;
  }
  if (identity.familyId && team.roster.some((p) => p.familyId === identity.familyId)) return team;
  if (identity.playerId && team.roster.some((p) => p.id === identity.playerId)) return team;
  return null;
}

/**
 * Fetch-time player gate. A parent cannot pull another family's player,
 * even by sending the id directly. A player cannot pull a teammate's record.
 */
export function requestPlayer(
  club: ClubOs,
  identity: OsIdentity,
  teamId: string,
  playerId: string,
): OsPlayer | null {
  const team = requestTeam(club, identity, teamId);
  if (!team) return null;
  const player = team.roster.find((p) => p.id === playerId) ?? null;
  if (!player) return null;
  if (identity.role === "admin") return player;
  if (identity.role === "coach") return player;
  if (identity.role === "parent") {
    return identity.familyId && player.familyId === identity.familyId ? player : null;
  }
  if (identity.playerId && player.id === identity.playerId) return player;
  if (identity.email && player.email?.toLowerCase() === identity.email.toLowerCase()) return player;
  return null;
}

