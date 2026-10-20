import type { ClubRecord, Player, StaffMember, Team } from "./types";
import { mergeSave, scopeClub } from "./privacy";

const playerMoney = [
  "agreement",
  "feeLock",
  "planLock",
  "credits",
  "payments",
  "cards",
  "planType",
  "depositPaid",
  "uniformWaived",
  "cageOverage",
] as const;
const teamMoney = ["orgFee", "coachMonthly", "eventBudget", "otherCosts"] as const;
const staffMoney = ["monthly", "applyAmount", "childId", "w9"] as const;
const emptyBilling = {
  agreement: { version: "", signedBy: "", signedAt: "" },
  feeLock: null,
  planLock: null,
  credits: [],
  payments: [],
  cards: [],
  planType: "",
  depositPaid: false,
  uniformWaived: false,
  cageOverage: 0,
};
const emptyCosts = {
  orgFee: 0,
  coachMonthly: 0,
  eventBudget: 0,
  otherCosts: { insurance: 0, balls: 0, fields: 0, admin: 0, travel: 0 },
};
const emptyStaffMoney = { monthly: 0, applyAmount: 0, childId: "", w9: false };
type Identity = Parameters<typeof scopeClub>[2];
type Role = Parameters<typeof scopeClub>[1];
const pick = <T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> =>
  Object.fromEntries(
    keys.filter((k) => Object.hasOwn(value, k)).map((k) => [k, structuredClone(value[k])]),
  ) as Pick<T, K>;

/** Explicit field projection: unknown legacy fields must not cross the
 * operational boundary, even when the caller is an owner. Required legacy
 * money slots are neutral placeholders and cannot be edited in this DTO. */
export function operationalClubView(club: ClubRecord, role: Role, identity: Identity): ClubRecord {
  const source = scopeClub(club, role, identity);
  return {
    ...pick(source, [
      "_rev",
      "_savedAt",
      "_demo",
      "onboarding",
      "leads",
      "alumni",
      "notifications",
    ]),
    audit: [],
    settings: {
      contingencyPct: 0,
      membershipMonthly: 0,
      facilityMonthly: 0,
      fundingPlayers: 0,
      cardFeePct: 0,
      orgFeeFloor: 0,
      orgFeeCeiling: 0,
      coachPayMin: 0,
      coachPayMax: 0,
      cageHourly: 0,
      roundTo: 0,
      policyVersion: "",
    },
    catalog: source.catalog.map((e) => ({
      ...pick(e, [
        "id",
        "org",
        "name",
        "city",
        "state",
        "start",
        "end",
        "ages",
        "levels",
        "sport",
        "type",
        "stayToPlay",
        "verifiedOn",
        "sourceUrl",
        "sourceCheckedOn",
        "distanceMiles",
      ]),
      fee: 0,
    })),
    uniforms: source.uniforms.map((u) => ({
      ...pick(u, ["id", "name", "sport", "items", "colourways", "sizeFields"]),
      price: 0,
    })),
    teams: source.teams.map((t) => ({
      ...pick(t, [
        "id",
        "name",
        "sport",
        "age",
        "level",
        "seasonLabel",
        "seasons",
        "seasonStart",
        "seasonEnd",
        "months",
        "headCoach",
        "coachEmail",
        "headCoachBio",
        "headCoachPhoto",
        "uniformPackageId",
        "uniformDeadline",
        "tournamentIds",
        "teamCageHoursPerWeek",
        "playerCageHoursPerWeek",
        "record",
        "practices",
        "messages",
        "announcements",
        "attendance",
        "pitchLog",
        "closed",
        "notes",
      ]),
      ...structuredClone(emptyCosts),
      staff: t.staff.map((s) => ({
        ...pick(s, [
          "id",
          "name",
          "role",
          "email",
          "bio",
          "photo",
          "backgroundCheck",
          "safeSport",
          "expires",
        ]),
        ...emptyStaffMoney,
      })),
      roster: t.roster.map((p) => ({
        ...pick(p, [
          "id",
          "teamId",
          "familyId",
          "name",
          "number",
          "positions",
          "bats",
          "throws",
          "gradYear",
          "school",
          "height",
          "weight",
          "email",
          "parents",
          "roleType",
          "coachChild",
          "joinedOn",
          "withdrawn",
          "rosterConsent",
          "order",
          "docs",
          "emergency",
          "publicProfile",
          "prefs",
          "reenroll",
          "stats",
          "rsvp",
        ]),
        ...structuredClone(emptyBilling),
      })),
    })),
  };
}
function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function moneyOnly(club: ClubRecord) {
  return {
    settings: club.settings,
    catalog: club.catalog.map((e) => [e.id, e.fee]),
    uniforms: club.uniforms.map((u) => [u.id, u.price]),
    teams: club.teams.map((t) => ({
      id: t.id,
      ...pick(t, teamMoney),
      staff: t.staff.map((s) => ({ id: s.id, ...pick(s, staffMoney) })),
      roster: t.roster.map((p) => ({ id: p.id, ...pick(p, playerMoney) })),
    })),
  };
}
/** Validate placeholders before merging; never translate bulk diffs into a
 * financial command. Preserve hidden storage fields and payment ledgers by
 * global player identity, including transfers and asynchronous payment writes. */
export function mergeOperationalSave(
  stored: ClubRecord,
  incoming: ClubRecord,
  role: Role,
  identity: Identity,
): ClubRecord {
  const neutral = operationalClubView(incoming, "admin", identity);
  if (!same(moneyOnly(incoming), moneyOnly(neutral)))
    throw new Error("Use the financial workspace to change financial terms or payments.");
  const projected = operationalClubView(stored, role, identity);
  const next =
    role === "admin"
      ? {
          ...incoming,
          audit: stored.audit,
          _rev: stored._rev + 1,
          _savedAt: new Date().toISOString(),
        }
      : mergeSave(projected, incoming, role, identity);
  const oldPlayers = new Map(stored.teams.flatMap((t) => t.roster.map((p) => [p.id, p] as const)));
  const restorePlayer = (p: Player): Player => ({
    ...oldPlayers.get(p.id),
    ...p,
    ...pick(oldPlayers.get(p.id) || { ...p, ...emptyBilling }, playerMoney),
  });
  const restoreTeam = (t: Team): Team => {
    const old = stored.teams.find((x) => x.id === t.id);
    return {
      ...old,
      ...t,
      ...pick(old || { ...t, ...emptyCosts }, teamMoney),
      staff: t.staff.map((s): StaffMember => {
        const before = old?.staff.find((x) => x.id === s.id);
        return { ...before, ...s, ...pick(before || { ...s, ...emptyStaffMoney }, staffMoney) };
      }),
      roster: t.roster.map(restorePlayer),
    };
  };
  // Non-owner mergeSave must retain unscoped teams and records, using its
  // normal write whitelist against full storage rather than scoped output.
  const merged = role === "admin" ? next : mergeSave(stored, incoming, role, identity);
  return {
    ...stored,
    ...merged,
    settings: stored.settings,
    audit: stored.audit,
    catalog: merged.catalog.map((e) => ({
      ...e,
      fee: stored.catalog.find((x) => x.id === e.id)?.fee || 0,
    })),
    uniforms: merged.uniforms.map((u) => ({
      ...u,
      price: stored.uniforms.find((x) => x.id === u.id)?.price || 0,
    })),
    teams: merged.teams.map(restoreTeam),
  };
}
