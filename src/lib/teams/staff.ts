import type { ClubOs, OsStaff, OsTeam } from "./model";
import { TODAY, addDays, iso, uid } from "./engine/00-helpers.js";
import {
  COACH_CREDIT,
  maxDivert,
  playerFee,
  seasonLen,
  staffCash,
  staffChild,
  staffSeasonPay,
  syncStaffOffsets,
} from "./engine/02-pricing.js";
import { logAudit, notify } from "./engine/03-domain.js";

function monthKey(value: Date | string): string {
  return iso(value).slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function monthList(start: string, count: number): string[] {
  const [y, m] = start.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const dt = new Date(y, (m || 1) - 1 + i, 1);
    out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export const PAY_CATEGORIES = ["travel", "hotel", "mileage", "equipment"] as const;
export type PayCategory = (typeof PAY_CATEGORIES)[number];

export type PayrollRow = {
  team: OsTeam;
  member: OsStaff;
  gross: number;
  applied: number;
  cash: number;
  needs1099: boolean;
  w9: boolean;
  canPay: boolean;
  childName: string | null;
};

export type PayrollMonth = {
  month: string;
  label: string;
  gross: number;
  applied: number;
  cash: number;
};

function n(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function threshold1099(club: ClubOs) {
  return n(club.settings.payroll?.form1099Threshold) || 600;
}

export function flags1099(gross: number, club: ClubOs) {
  return n(gross) >= threshold1099(club);
}

/** Remaining fee the child still owes, ignoring an existing coach-pay credit. */
export function childOwes(club: ClubOs, team: OsTeam, member: OsStaff) {
  const kid = staffChild(team, member) as ReturnType<typeof staffChild>;
  if (!kid) return 0;
  const fee = n(playerFee(club, team, kid));
  const other = (kid.credits || [])
    .filter((c: { note?: string }) => c.note !== COACH_CREDIT)
    .reduce((a: number, c: { amount: number }) => a + n(c.amount), 0);
  const paid = (kid.payments || []).reduce(
    (a: number, p: { amount: number }) => a + n(p.amount),
    0,
  );
  return Math.max(0, fee - other - paid);
}

/** Credit may never exceed what the child actually owes, or the season pay. */
export function divertCap(club: ClubOs, team: OsTeam, member: OsStaff) {
  const engine = n(maxDivert(club, team, member));
  const owed = childOwes(club, team, member);
  const pay = n(staffSeasonPay(team, member));
  return Math.max(0, Math.min(engine, owed, pay));
}

export function electionOf(
  club: ClubOs,
  team: OsTeam,
  member: OsStaff,
  applyAmount?: number,
) {
  const gross = n(staffSeasonPay(team, member));
  const cap = divertCap(club, team, member);
  const applied =
    applyAmount == null
      ? Math.max(0, Math.min(n(member.applyAmount), cap))
      : Math.max(0, Math.min(n(applyAmount), cap));
  const cash = Math.max(0, gross - applied);
  const kid = staffChild(team, member) as ReturnType<typeof staffChild>;
  const remaining = kid ? Math.max(0, childOwes(club, team, member) - applied) : 0;
  return {
    gross,
    cap,
    applied,
    cash,
    remaining,
    childName: kid ? String(kid.name) : null,
    childId: kid ? String(kid.id) : null,
  };
}

export function applyElectPay(
  club: ClubOs,
  teamId: string,
  staffId: string,
  applyAmount: number,
  actor: string,
): { ok: boolean; applied: number; cash: number; gross: number; remaining: number } {
  const team = club.teams.find((t) => t.id === teamId);
  const member = team?.staff.find((m) => m.id === staffId);
  if (!team || !member) {
    return { ok: false, applied: 0, cash: 0, gross: 0, remaining: 0 };
  }
  const next = electionOf(club, team, member, applyAmount);
  member.applyAmount = next.applied;
  syncStaffOffsets(team);
  const kid = staffChild(team, member) as ReturnType<typeof staffChild>;
  const credit = (kid?.credits || []).find((c: { note?: string }) => c.note === COACH_CREDIT);
  if (next.applied > 0 && credit && !credit.note) {
    credit.note = COACH_CREDIT;
  }
  logAudit(
    club,
    actor,
    "staff-elect",
    `${member.name} applied ${next.applied} of ${next.gross} to fees; cash ${next.cash}.`,
  );
  return {
    ok: true,
    applied: next.applied,
    cash: n(staffCash(team, member)),
    gross: next.gross,
    remaining: next.remaining,
  };
}

export function payrollRows(club: ClubOs, team?: OsTeam | null): PayrollRow[] {
  const teams = team ? [team] : club.teams;
  const cut = threshold1099(club);
  const rows: PayrollRow[] = [];
  for (const t of teams) {
    for (const member of t.staff || []) {
      const gross = n(staffSeasonPay(t, member));
      const applied = n(member.applyAmount);
      const cash = n(staffCash(t, member));
      const kid = staffChild(t, member) as ReturnType<typeof staffChild>;
      rows.push({
        team: t,
        member,
        gross,
        applied,
        cash,
        needs1099: gross >= cut,
        w9: Boolean(member.w9),
        canPay: Boolean(member.w9),
        childName: kid ? String(kid.name) : null,
      });
    }
  }
  return rows;
}

export function payrollSchedule(club: ClubOs, team: OsTeam): PayrollMonth[] {
  const start = monthKey(team.seasonStart || TODAY);
  const months = Math.max(1, n(seasonLen(team)));
  const keys = monthList(start, months);
  const staff = team.staff || [];
  return keys.map((month) => {
    const gross = staff.reduce((a, m) => a + n(m.monthly), 0);
    const applied = staff.reduce((a, m) => a + n(m.applyAmount) / months, 0);
    const cash = Math.max(0, gross - Math.round(applied));
    return {
      month,
      label: monthLabel(month),
      gross,
      applied: Math.round(applied),
      cash,
    };
  });
}

export function applyRecordPayout(
  club: ClubOs,
  teamId: string,
  staffId: string,
  amount: number,
  actor: string,
): { ok: boolean; reason?: "missing" | "w9"; id?: string } {
  const team = club.teams.find((t) => t.id === teamId);
  const member = team?.staff.find((m) => m.id === staffId);
  if (!team || !member) return { ok: false, reason: "missing" };
  if (!member.w9) return { ok: false, reason: "w9" };
  const cash = n(staffCash(team, member));
  const pay = Math.max(0, Math.min(n(amount) || cash, cash));
  if (!club.payouts) club.payouts = [];
  const id = uid();
  (club.payouts as { id: string; teamId: string; staffId: string; amount: number; date: string; kind: string }[]).push({
    id,
    teamId: team.id,
    staffId: member.id,
    amount: pay,
    date: iso(TODAY),
    kind: "cash",
  });
  logAudit(club, actor, "staff-payout", `${member.name} cash ${pay}. W-9 on file.`);
  notify(club, team.id, "Contractor payout", `${member.name} cash ${pay}.`, "money", "admin");
  return { ok: true, id };
}

export function isReportable(row: {
  receipt?: boolean | string | null;
  purpose?: string | null;
}) {
  const receipt = Boolean(row.receipt);
  const purpose = String(row.purpose || "").trim().length > 0;
  return !(receipt && purpose);
}

export function applyAddReimbursement(
  club: ClubOs,
  input: {
    teamId: string;
    staffEmail: string;
    amount: number;
    date: string;
    note: string;
    category: PayCategory;
    purpose: string;
    receipt: boolean;
  },
  actor: string,
): { ok: boolean; reportable: boolean } {
  const team = club.teams.find((t) => t.id === input.teamId);
  if (!team) return { ok: false, reportable: true };
  const reportable = isReportable(input);
  if (!club.reimbursements) club.reimbursements = [];
  club.reimbursements.unshift({
    id: uid(),
    teamId: team.id,
    staffEmail: input.staffEmail,
    amount: n(input.amount),
    date: input.date || iso(TODAY),
    note: input.note,
    status: "open",
    category: input.category,
    purpose: input.purpose,
    receipt: input.receipt,
    reportable,
  });
  logAudit(
    club,
    actor,
    "reimburse",
    `${input.note} ${n(input.amount)}${reportable ? " — reportable, no receipt" : " — accountable plan"}`,
  );
  notify(
    club,
    team.id,
    reportable ? "Reportable reimbursement" : "Accountable reimbursement",
    reportable
      ? `${input.note} is missing a receipt or purpose. It will sit on the 1099.`
      : `${input.note} substantiated. Off the 1099.`,
    "money",
    "admin",
  );
  return { ok: true, reportable };
}

export function complianceOf(member: OsStaff, asOf: Date | string = TODAY) {
  const day = iso(asOf);
  const expires = String(member.expires || "");
  const expired = Boolean(expires && expires < day);
  const dueSoon = Boolean(expires && expires <= iso(addDays(asOf, 30)));
  const background = Boolean(member.backgroundCheck);
  const safeSport = Boolean(member.safeSport);
  return {
    background,
    safeSport,
    expires,
    expired,
    dueSoon,
    ok: background && safeSport && !expired,
  };
}

export function reportableGross(club: ClubOs, team: OsTeam, member: OsStaff) {
  const gross = n(staffSeasonPay(team, member));
  const extra = (club.reimbursements || [])
    .filter((r) => r.teamId === team.id && r.staffEmail === (member as OsStaff & { email?: string }).email)
    .filter((r) => isReportable(r))
    .reduce((a, r) => a + n(r.amount), 0);
  return gross + extra;
}
