/**
 * DORMANT SERVER-ONLY foundation. No route, background backfill, or production
 * consumer imports this module. Its full snapshot is private financial data:
 * never return it from an operational API or merge it into an organization DTO.
 *
 * Initialization is an explicit, owner-authorized command. Subsequent commands
 * start from the saved version; they NEVER reread operational metadata. Provider
 * and household adapters still require a separate reviewed cutover.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { ClubRecord, Team, Player } from "../teams/types";
import type { FeePlan } from "../teams/fee-contracts";
import type { TeamActivity } from "../teams/activity-contracts";
import { lockFinancialExecution } from "./execution.server";

const BASIS_ID = "oklahoma-prospects";
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type SourceRow = { [key: string]: Json };
export type FinancialInputs = {
  schemaVersion: 1;
  club: ClubRecord;
  feePlans: { team_id: string; revision: number; payload: FeePlan }[];
  feeBusiness: SourceRow[];
  budgetMaster: SourceRow[];
  activities: { id: string; team_id: string; revision: number; payload: TeamActivity }[];
  billing: {
    accounts: {
      id: string;
      email: string;
      name: string;
      role: string | null;
      profileName?: string | null;
      admittedAgreementIds?: string[];
      admittedTeamIds?: string[];
    }[];
    agreementGuardians?: { agreementId: string; userId: string; householdId: string }[];
    households: { id: string; primary_email: string }[];
    members: { household_id: string; user_id: string }[];
    guardians: { household_id: string; user_id: string }[];
    playerLinks: { player_id: string; user_id: string }[];
  };
  compensation: {
    development: { coaches: Json; coachPayouts: Json }[];
    services?: SourceRow[];
    staff: SourceRow[];
    staffServices: SourceRow[];
    bookings: SourceRow[];
    earnings: SourceRow[];
    payeesAndRules: SourceRow[];
    ownerAssignments: SourceRow[];
  };
};
export type FinancialTeamSeason = { id: string; originalTeamId: string };
export type FinancialPlayerAgreement = {
  id: string;
  teamSeasonId: string;
  originalPlayerId: string;
};
export type FinancialBasis = {
  version: number;
  activationState: "captured" | "active";
  activeVersion: number | null;
  sourceClubRevision: number;
  sourceDigest: string;
  inputs: FinancialInputs;
  teams: FinancialTeamSeason[];
  agreements: FinancialPlayerAgreement[];
  teamAliases: { teamId: string; teamSeasonId: string }[];
  playerAliases: { teamId: string; playerId: string; agreementId: string }[];
};
export type FinancialBasisReceipt = {
  version: number;
  activationState: "captured";
  activeVersion: null;
  sourceClubRevision: number;
  sourceDigest: string;
  payloadDigest: string;
};

/** Object-key order is irrelevant; array order (staff splits, roster, terms) is not. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new Error("Financial inputs must be plain JSON values.");
    return `{${Object.entries(value)
      // Persisted digests must not depend on a server's locale/ICU collation.
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined || (typeof value === "number" && !Number.isFinite(value)))
    throw new Error("Financial inputs must be finite JSON values.");
  return result;
}
function digest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
/** Shared canonical digest; array order remains significant. Pure, no authority. */
export const financialBasisDigest = digest;
function reasonFor(reason: string) {
  const result = reason.trim();
  if (!result || result.length > 1000) throw new Error("Provide a financial change reason.");
  return result;
}
function assertVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 1)
    throw new Error("A current financial basis version is required.");
}

/** No first-login owner claim, implicit role promotion, or household mutation. */
async function requireBasisOwner(tx: Sql, userId: string) {
  if (typeof window !== "undefined") throw new Error("Financial basis is server-only.");
  // Prevent a concurrent new sticky restriction, including when no row exists.
  await tx.query("lock table organization_operational_access in share mode");
  const [owner] = await tx.query<{ id: string }>(
    `
    select u.id from "user" u
    join profiles p on p.user_id=u.id and p.role='admin'
    join owner_grants g on g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null
    where u.id=$1 and u."emailVerified"=true and u."disabledAt" is null
      and not exists(select 1 from organization_operational_access a where a.user_id=u.id and a.financial_restricted=true)
    for share of u,p,g`,
    [userId],
  );
  if (!owner) throw new Error("Financial owner access required.");
}

/** These locks protect inserts as well as updates/deletes during explicit capture. */
async function captureInputs(tx: Sql) {
  await tx.query(`lock table club_state,team_fee_plans,team_fee_business,team_budget_master,
    team_activities,"user",profiles,club_households,household_members,person_guardian_links,
    person_player_links,pd_working_file,club_services,club_staff,club_staff_services,booking_records,
    contractor_earnings,finance_records,owner_grants in share mode`);
  const [club] = await tx<{
    payload: ClubRecord;
    rev: number;
    demo: boolean;
  }>`select payload,rev,demo from club_state where id=${BASIS_ID}`;
  if (!club || club.demo || club.payload._demo)
    throw new Error("A persisted, non-demo club is required for financial initialization.");
  const inputs: FinancialInputs = {
    schemaVersion: 1,
    club: club.payload,
    feePlans: await tx`select team_id,revision,payload from team_fee_plans order by team_id`,
    feeBusiness: await tx`select id,revision,payload from team_fee_business order by id`,
    budgetMaster: await tx`select id,revision,payload from team_budget_master order by id`,
    activities: await tx`select id,team_id,revision,payload from team_activities order by id`,
    billing: {
      // Authentication secrets and account eligibility are not copied. Current
      // verified/disabled/restricted status MUST be checked at every future use.
      accounts:
        await tx`select u.id,u.email,u.name,p.name as "profileName",p.role from "user" u left join profiles p on p.user_id=u.id order by u.id`,
      households: await tx`select id,primary_email from club_households order by id`,
      members:
        await tx`select household_id,user_id from household_members order by household_id,user_id`,
      guardians:
        await tx`select household_id,user_id from person_guardian_links order by household_id,user_id`,
      playerLinks:
        await tx`select player_id,user_id from person_player_links order by player_id,user_id`,
    },
    compensation: {
      services: (
        await tx<{ value: SourceRow }>`select to_jsonb(s) as value from club_services s order by id`
      ).map((r) => r.value),
      development:
        await tx`select payload::jsonb->'coaches' as coaches,payload::jsonb->'coachPayouts' as "coachPayouts" from pd_working_file where id='club'`,
      staff: (
        await tx<{ value: SourceRow }>`select to_jsonb(s) as value from club_staff s order by id`
      ).map((r) => r.value),
      staffServices: (
        await tx<{
          value: SourceRow;
        }>`select to_jsonb(s) as value from club_staff_services s order by staff_id,service_id`
      ).map((r) => r.value),
      // Preserve the source's attribution and duration/status determinants,
      // without copying provider credentials or treating this as a live ledger.
      bookings:
        await tx`select id,order_id,user_id,athlete_id,coach_id,product_id,starts_at::text,ends_at::text,status,completed_at::text from booking_records order by id`,
      earnings: (
        await tx<{
          value: SourceRow;
        }>`select to_jsonb(e) as value from contractor_earnings e order by booking_id`
      ).map((r) => r.value),
      payeesAndRules:
        await tx`select id,kind,payload from finance_records where kind in ('payee','rule') order by created_at,id`,
      ownerAssignments:
        await tx`select g.email,g.user_id,coalesce(u.name,g.email) as name from owner_grants g left join "user" u on u.id=g.user_id where g.revoked_at is null order by g.email`,
    },
  };
  validateClubIdentities(inputs.club);
  return { inputs, sourceClubRevision: club.rev, sourceDigest: digest(inputs) };
}

function validateClubIdentities(club: ClubRecord) {
  const teams = new Set<string>();
  const players = new Set<string>();
  for (const team of club.teams) {
    if (!team.id || teams.has(team.id))
      throw new Error("Duplicate or missing financial team source identity.");
    teams.add(team.id);
    for (const player of team.roster) {
      // Existing checkout deduplication uses playerId globally, so ambiguous
      // duplicate IDs cannot safely acquire a new financial interpretation.
      if (!player.id || players.has(player.id) || player.teamId !== team.id)
        throw new Error("Duplicate, missing, or inconsistent financial player source identity.");
      players.add(player.id);
    }
  }
}

/** Preview returns only a review token/counts; no data is initialized. */
export async function previewFinancialBasisInitialization(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const [existing] = await tx`select id from financial_basis_state where id=${BASIS_ID}`;
    if (existing)
      throw new Error(
        "Financial basis is already initialized. Do not resnapshot operational data.",
      );
    const captured = await captureInputs(tx);
    return {
      sourceClubRevision: captured.sourceClubRevision,
      sourceDigest: captured.sourceDigest,
      teams: captured.inputs.club.teams.length,
      agreements: captured.inputs.club.teams.reduce((n, t) => n + t.roster.length, 0),
    };
  });
}

/** Atomic, explicitly invoked owner command; never called by a migration/build. */
export async function initializeFinancialBasisForOwner(
  sql: Sql,
  userId: string,
  command: { sourceClubRevision: number; sourceDigest: string; reason: string },
): Promise<FinancialBasisReceipt> {
  const reason = reasonFor(command.reason);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    // Serializes initialization even while the singleton row does not exist.
    await tx.query("lock table financial_basis_state in share row exclusive mode");
    const [existing] = await tx`select id from financial_basis_state where id=${BASIS_ID}`;
    if (existing)
      throw new Error(
        "Financial basis is already initialized. Do not resnapshot operational data.",
      );
    const { inputs, sourceClubRevision, sourceDigest } = await captureInputs(tx);
    if (sourceClubRevision !== command.sourceClubRevision || sourceDigest !== command.sourceDigest)
      throw new Error("Financial source inputs changed. Review a fresh initialization preview.");
    await tx`insert into financial_basis_state(id,current_version,source_club_revision,source_digest,initialized_by) values(${BASIS_ID},1,${sourceClubRevision},${sourceDigest},${userId})`;
    await tx`insert into financial_basis_versions(basis_id,version,payload,payload_digest,changed_by,reason) values(${BASIS_ID},1,${JSON.stringify(inputs)}::jsonb,${sourceDigest},${userId},${reason})`;
    for (const team of inputs.club.teams) {
      const teamSeasonId = randomUUID();
      await tx`insert into financial_team_seasons(id,basis_id,original_team_id) values(${teamSeasonId},${BASIS_ID},${team.id})`;
      await tx`insert into financial_team_aliases(basis_id,legacy_team_id,team_season_id,created_version) values(${BASIS_ID},${team.id},${teamSeasonId},1)`;
      for (const player of team.roster) {
        const agreementId = randomUUID();
        await tx`insert into financial_player_agreements(id,basis_id,team_season_id,original_player_id) values(${agreementId},${BASIS_ID},${teamSeasonId},${player.id})`;
        await tx`insert into financial_player_aliases(basis_id,legacy_team_id,legacy_player_id,agreement_id,created_version) values(${BASIS_ID},${team.id},${player.id},${agreementId},1)`;
      }
    }
    return {
      version: 1,
      activationState: "captured",
      activeVersion: null,
      sourceClubRevision,
      sourceDigest,
      payloadDigest: sourceDigest,
    };
  });
}

async function readBasis(tx: Sql, lock = false): Promise<FinancialBasis | null> {
  const [state] = await tx.query<{
    current_version: number;
    source_club_revision: number;
    source_digest: string;
    activation_state: string;
    active_version: number | null;
  }>(
    `select current_version,source_club_revision,source_digest,activation_state,active_version from financial_basis_state where id=$1${lock ? " for update" : " for share"}`,
    [BASIS_ID],
  );
  if (!state) return null; // No legacy fallback or implicit initialization.
  if (state.activation_state !== "captured" || state.active_version !== null)
    throw new Error("This repository only supports captured, inactive financial versions.");
  const [version] = await tx<{
    payload: FinancialInputs;
    payload_digest: string;
  }>`select payload,payload_digest from financial_basis_versions where basis_id=${BASIS_ID} and version=${state.current_version}`;
  if (
    !version ||
    version.payload.schemaVersion !== 1 ||
    digest(version.payload) !== version.payload_digest
  )
    throw new Error("Financial basis version is unavailable or inconsistent.");
  return {
    version: state.current_version,
    activationState: "captured",
    activeVersion: null,
    sourceClubRevision: state.source_club_revision,
    sourceDigest: state.source_digest,
    inputs: version.payload,
    teams:
      await tx`select id,original_team_id as "originalTeamId" from financial_team_seasons where basis_id=${BASIS_ID} and created_version<=${state.current_version} order by original_team_id`,
    agreements:
      await tx`select id,team_season_id as "teamSeasonId",original_player_id as "originalPlayerId" from financial_player_agreements where basis_id=${BASIS_ID} and created_version<=${state.current_version} order by id`,
    teamAliases:
      await tx`select legacy_team_id as "teamId",team_season_id as "teamSeasonId" from financial_team_aliases where basis_id=${BASIS_ID} and created_version<=${state.current_version} order by legacy_team_id`,
    playerAliases:
      await tx`select legacy_team_id as "teamId",legacy_player_id as "playerId",agreement_id as "agreementId" from financial_player_aliases where basis_id=${BASIS_ID} and created_version<=${state.current_version} order by legacy_team_id,legacy_player_id`,
  };
}

/** Full private snapshot for INTERNAL financial consumers after owner auth only. */
export async function readFinancialBasisForOwner(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    return readBasis(tx);
  });
}

export function resolveFinancialTeam(
  basis: FinancialBasis,
  reference: { teamSeasonId: string } | { teamId: string },
): { identity: FinancialTeamSeason; team: Team } {
  const id =
    "teamSeasonId" in reference
      ? reference.teamSeasonId
      : basis.teamAliases.find((a) => a.teamId === reference.teamId)?.teamSeasonId;
  const identity = basis.teams.find((t) => t.id === id);
  const team = basis.inputs.club.teams.find((t) => t.id === identity?.originalTeamId);
  if (!identity || !team) throw new Error("Financial team identity is unavailable.");
  return { identity, team };
}

/** Always resolve old provider orders by the complete historical team/player pair. */
export function resolveFinancialAgreement(
  basis: FinancialBasis,
  reference: { agreementId: string } | { teamId: string; playerId: string },
): { identity: FinancialPlayerAgreement; team: Team; player: Player } {
  const id =
    "agreementId" in reference
      ? reference.agreementId
      : basis.playerAliases.find(
          (a) => a.teamId === reference.teamId && a.playerId === reference.playerId,
        )?.agreementId;
  const identity = basis.agreements.find((a) => a.id === id);
  if (!identity) throw new Error("Financial player agreement is unavailable.");
  const { team } = resolveFinancialTeam(basis, { teamSeasonId: identity.teamSeasonId });
  const player = team.roster.find((p) => p.id === identity.originalPlayerId);
  if (!player) throw new Error("Financial player agreement is unavailable.");
  return { identity, team, player };
}

/** Frozen billing attribution only. This is NOT an authentication decision:
 * callers must ALSO verify current account, restriction, and commerce eligibility.
 * Future/new household members need an explicit financial authorization change.
 */
export function hasFrozenFinancialGuardian(
  basis: FinancialBasis,
  agreementId: string,
  userId: string,
) {
  const { player } = resolveFinancialAgreement(basis, { agreementId });
  const billing = basis.inputs.billing;
  const account = billing.accounts.find((a) => a.id === userId);
  if (
    !account ||
    (account.admittedAgreementIds && !account.admittedAgreementIds.includes(agreementId))
  )
    return false;
  if (billing.agreementGuardians?.some((g) => g.agreementId === agreementId && g.userId === userId))
    return true;
  const norm = (v: string) => v.trim().toLowerCase();
  const guardianHome = billing.guardians.some(
    (g) => g.user_id === userId && g.household_id === player.familyId,
  );
  // resolveIdentity.familyIds includes guardian links for nonplayers too. It
  // lazily materializes primary-email household members at login; preserve that
  // already-effective binding without mutating the captured source records.
  const primaryEmailHome = billing.households.some(
    (h) => h.id === player.familyId && h.primary_email === norm(account.email),
  );
  return (
    guardianHome ||
    (account.role !== "player" &&
      (player.parents.some((g) => norm(g.email) === norm(account.email)) ||
        primaryEmailHome ||
        billing.members.some((m) => m.user_id === userId && m.household_id === player.familyId)))
  );
}

/**
 * Owner-only CAS primitive for explicit financial amendments/ledger writes.
 * The callback receives a detached saved financial snapshot, never live club data.
 * New seasons/agreements and nonowner/provider service adapters are NOT enabled.
 */
export async function updateFinancialBasisForOwner(
  sql: Sql,
  userId: string,
  command: { expectedVersion: number; reason: string },
  update: (draft: FinancialBasis) => void | Promise<void>,
): Promise<FinancialBasisReceipt> {
  assertVersion(command.expectedVersion);
  const reason = reasonFor(command.reason);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const basis = await readBasis(tx, true);
    if (!basis) throw new Error("Financial basis is not initialized.");
    if (basis.version !== command.expectedVersion)
      throw new Error("Financial basis changed. Refresh before saving.");
    const draft = structuredClone(basis);
    await update(draft);
    validateClubIdentities(draft.inputs.club);
    const identityShape = (value: FinancialBasis) => ({
      ...value,
      inputs: value.inputs.club.teams.map((t) => [t.id, t.roster.map((p) => p.id)]),
    });
    if (
      digest(identityShape(draft)) !== digest(identityShape(basis)) ||
      draft.inputs.schemaVersion !== 1
    )
      throw new Error("Financial identity and aliases cannot change in a financial amendment.");
    const version = basis.version + 1;
    const payloadDigest = digest(draft.inputs);
    await tx`insert into financial_basis_versions(basis_id,version,payload,payload_digest,changed_by,reason) values(${BASIS_ID},${version},${JSON.stringify(draft.inputs)}::jsonb,${payloadDigest},${userId},${reason})`;
    const changed =
      await tx`update financial_basis_state set current_version=${version} where id=${BASIS_ID} and current_version=${command.expectedVersion} returning id`;
    if (!changed.length) throw new Error("Financial basis changed. Refresh before saving.");
    return {
      version,
      activationState: "captured",
      activeVersion: null,
      sourceClubRevision: basis.sourceClubRevision,
      sourceDigest: basis.sourceDigest,
      payloadDigest,
    };
  });
}

/** Explicit owner alias registration for later migration; never rewrites history. */
export async function addFinancialPlayerAliasForOwner(
  sql: Sql,
  userId: string,
  command: {
    expectedVersion: number;
    reason: string;
    agreementId: string;
    teamId: string;
    playerId: string;
  },
): Promise<FinancialBasisReceipt> {
  assertVersion(command.expectedVersion);
  const reason = reasonFor(command.reason);
  if (!command.teamId.trim() || !command.playerId.trim())
    throw new Error("Complete legacy player alias required.");
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const basis = await readBasis(tx, true);
    if (!basis || basis.version !== command.expectedVersion)
      throw new Error("Financial basis changed. Refresh before saving.");
    resolveFinancialAgreement(basis, { agreementId: command.agreementId });
    if (
      basis.playerAliases.some(
        (a) => a.teamId === command.teamId && a.playerId === command.playerId,
      )
    )
      throw new Error("Financial player alias already exists and cannot be repointed.");
    const version = basis.version + 1;
    const payloadDigest = digest(basis.inputs);
    await tx`insert into financial_basis_versions(basis_id,version,payload,payload_digest,changed_by,reason) values(${BASIS_ID},${version},${JSON.stringify(basis.inputs)}::jsonb,${payloadDigest},${userId},${reason})`;
    await tx`insert into financial_player_aliases(basis_id,legacy_team_id,legacy_player_id,agreement_id,created_version) values(${BASIS_ID},${command.teamId},${command.playerId},${command.agreementId},${version})`;
    const changed =
      await tx`update financial_basis_state set current_version=${version} where id=${BASIS_ID} and current_version=${command.expectedVersion} returning id`;
    if (!changed.length) throw new Error("Financial basis changed. Refresh before saving.");
    return {
      version,
      activationState: "captured",
      activeVersion: null,
      sourceClubRevision: basis.sourceClubRevision,
      sourceDigest: basis.sourceDigest,
      payloadDigest,
    };
  });
}
