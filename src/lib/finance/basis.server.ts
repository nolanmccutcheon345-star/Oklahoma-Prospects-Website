/**
 * SERVER-ONLY financial basis and separate explicit owner commands.
 * Migrations never activate or grant access. Its full snapshot is private financial data:
 * never return it from an operational API or merge it into an organization DTO.
 *
 * Initialization and captured-only refresh are explicit owner-reviewed commands.
 * Ordinary financial amendments start from saved versions, never live metadata.
 * A refresh receipt is not activation; provider/household cutover stays separate.
 */
import { createHash, randomUUID } from "node:crypto";
import type { Sql } from "../db";
import type { ClubRecord, Team, Player } from "../teams/types";
import type { FeePlan } from "../teams/fee-contracts";
import type { TeamActivity } from "../teams/activity-contracts";
import { lockFinancialExecution } from "./execution.server";
import { financialBasisActivationInput } from "./activation-contracts";

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
    instructorAccess?: {
      id: string;
      userId: string;
      coachId: string;
      payeeId: string;
      fromVersion: number;
      bookingIds: string[];
      orderIds: string[];
    }[];
    payrollAccess?: { id: string; userId: string; payeeId: string; fromMonth: string }[];
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

export type FinancialCutoverBlocker = {
  code: string;
  orderId?: string;
  bookingId?: string;
  attemptId?: string;
  detail: string;
};
export type FinancialLessonBindingProposal = {
  bookingId: string;
  orderId: string;
  basisId: string;
  basisVersion: number;
  originalBooking: SourceRow;
  approvedTerms: SourceRow;
};
export type FinancialSourceChange = {
  /** RFC 6901 JSON pointer. Arrays are reviewed whole to retain meaningful order. */
  path: string;
  beforePresent: boolean;
  afterPresent: boolean;
  before?: unknown;
  after?: unknown;
};
function financialSourceChanges(
  before: unknown,
  after: unknown,
  path = "",
): FinancialSourceChange[] {
  if (digest(before) === digest(after)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const previous = before as Record<string, unknown>;
    const current = after as Record<string, unknown>;
    return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
      .sort()
      .flatMap((key) => {
        const at = path + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1");
        const beforePresent = Object.hasOwn(previous, key);
        const afterPresent = Object.hasOwn(current, key);
        return beforePresent && afterPresent
          ? financialSourceChanges(previous[key], current[key], at)
          : [
              {
                path: at,
                beforePresent,
                afterPresent,
                ...(beforePresent ? { before: previous[key] } : {}),
                ...(afterPresent ? { after: current[key] } : {}),
              },
            ];
      });
  }
  return [{ path, beforePresent: true, afterPresent: true, before, after }];
}
type CutoverEvidence = {
  orders: {
    id: string;
    user_id: string | null;
    athlete_id: string | null;
    product_id: string;
    total_cents: number;
    currency: string;
    hold_until: string | null;
    kind: string;
    status: string;
    snapshot: SourceRow;
    payment_provider: string;
    payment_environment: string | null;
    paid_at: string | null;
    square_payment_id: string | null;
    square_fee_payment_id: string | null;
    payment_intent_id: string | null;
    checkout_session_id: string | null;
    subscription_setup_status: string | null;
  }[];
  attempts: { id: string; order_id: string; status: string; payment_id: string | null }[];
  payments: SourceRow[];
  bookings: SourceRow[];
  bindings: SourceRow[];
  recognitions: SourceRow[];
  grants: SourceRow[];
  uses: SourceRow[];
  refunds: SourceRow[];
  versions: { version: number; payload_digest: string; audited_refresh: boolean }[];
};

/** The caller owns the gate and owner check. No provider/network work occurs here.
 * Table locks cover inserts and independent payment/fulfillment changes, not just
 * the club revision. Secrets (attempt token_hash/card/customer data) are omitted. */
async function captureCutoverEvidence(tx: Sql): Promise<CutoverEvidence> {
  await tx.query(`lock table commerce_orders,square_payment_attempts,square_payments,
    booking_records,financial_lesson_bindings,financial_lesson_recognitions,
    credit_grants,credit_uses,commerce_refunds,finance_audit,financial_basis_versions in share mode`);
  return {
    orders: await tx`select id,user_id,athlete_id,product_id,total_cents,currency,hold_until::text,
      kind,status,snapshot,payment_provider,payment_environment,
      paid_at::text,square_payment_id,square_fee_payment_id,payment_intent_id,
      checkout_session_id,subscription_setup_status from commerce_orders order by id`,
    attempts:
      await tx`select id,order_id,status,payment_id from square_payment_attempts order by id`,
    payments:
      await tx`select id,order_id,status,environment,purpose,amount_cents,refunded_cents from square_payments order by id`,
    bookings: await tx`select id,order_id,user_id,athlete_id,coach_id,product_id,
      starts_at::text,ends_at::text,status,completed_at::text,lesson_config from booking_records order by id`,
    bindings:
      await tx`select booking_id,basis_id,basis_version,order_id,original_booking,approved_terms from financial_lesson_bindings order by booking_id`,
    recognitions:
      await tx`select booking_id,basis_id,basis_version,recognized_by,recognized_at::text,actor_kind,reason from financial_lesson_recognitions order by booking_id`,
    grants:
      await tx`select id,user_id,athlete_id,order_id,payment_id,subscription_id,kind,quantity,remaining,starts_at::text,expires_at::text from credit_grants order by id`,
    uses: await tx`select id,grant_id,booking_id,quantity,reversed_at::text,restored_quantity from credit_uses order by id`,
    refunds:
      await tx`select id,order_id,booking_id,amount_cents,status,square_payment_id,square_refund_id,external_status from commerce_refunds order by id`,
    versions: await tx`select v.version,v.payload_digest,exists(
      select 1 from finance_audit a where a.record_id=v.basis_id
        and a.action='Captured financial basis refresh' and a.actor_id=v.changed_by
        and a.after_state->>'version'=v.version::text
        and a.after_state->>'payloadDigest'=v.payload_digest
        and a.after_state->>'activationState'='captured'
        and a.after_state->'activeVersion'='null'::jsonb
        and a.after_state->>'refreshedSourceDigest'=v.payload_digest
      ) as audited_refresh from financial_basis_versions v
      where v.basis_id=${BASIS_ID} order by v.version`,
  };
}
function objectValue(value: Json | undefined): SourceRow | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function sourceIdentityMap(club: ClubRecord) {
  return club.teams
    .map((team) => ({
      teamId: team.id,
      players: team.roster.map((player) => player.id).sort(),
    }))
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
}
function assertRefreshIdentities(basis: FinancialBasis, inputs: FinancialInputs) {
  const expected = basis.teams
    .map((team) => ({
      teamId: team.originalTeamId,
      players: basis.agreements
        .filter((a) => a.teamSeasonId === team.id)
        .map((a) => a.originalPlayerId)
        .sort(),
    }))
    .sort((a, b) => (a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0));
  if (
    digest(sourceIdentityMap(inputs.club)) !== digest(expected) ||
    digest(sourceIdentityMap(basis.inputs.club)) !== digest(expected)
  )
    throw new Error(
      "Financial team/player identity map changed. New, removed, or moved identities require separate reviewed admission; refresh cannot reenroll them.",
    );
  if (
    basis.teams.some(
      (team) =>
        !basis.teamAliases.some(
          (alias) => alias.teamId === team.originalTeamId && alias.teamSeasonId === team.id,
        ),
    ) ||
    basis.agreements.some(
      (agreement) =>
        !basis.playerAliases.some(
          (alias) =>
            alias.playerId === agreement.originalPlayerId &&
            alias.agreementId === agreement.id &&
            alias.teamId ===
              basis.teams.find((team) => team.id === agreement.teamSeasonId)?.originalTeamId,
        ),
    )
  )
    throw new Error("Original financial identity aliases are inconsistent.");
}

async function cutoverPlan(
  tx: Sql,
  basis: FinancialBasis,
  inputs: FinancialInputs,
  basisVersion: number,
  evidence: CutoverEvidence,
) {
  const blockers: FinancialCutoverBlocker[] = [];
  const bindingPlan: FinancialLessonBindingProposal[] = [];
  const untouchedQuoteIds: string[] = [];
  const add = (
    code: string,
    detail: string,
    ids: Omit<FinancialCutoverBlocker, "code" | "detail"> = {},
  ) => blockers.push({ code, detail, ...ids });
  for (const attempt of evidence.attempts) {
    if (!["completed", "declined"].includes(attempt.status))
      add(
        "in_flight_charge",
        "Reconcile this pending or unknown provider outcome outside the financial transaction; never rewrite its pin.",
        { orderId: attempt.order_id, attemptId: attempt.id },
      );
    else if (
      attempt.status === "completed" &&
      !evidence.payments.some(
        (p) =>
          p.id === attempt.payment_id &&
          p.order_id === attempt.order_id &&
          p.status === "COMPLETED",
      )
    )
      add("unreconciled_charge", "A completed attempt lacks its matching reconciled payment.", {
        orderId: attempt.order_id,
        attemptId: attempt.id,
      });
  }
  for (const payment of evidence.payments) {
    if (!["COMPLETED", "FAILED", "CANCELED"].includes(String(payment.status)))
      add("unreconciled_charge", "A stored payment still has an unresolved provider outcome.", {
        orderId: String(payment.order_id),
      });
  }
  for (const refund of evidence.refunds) {
    if (["pending", "PENDING", "unknown"].includes(String(refund.status)))
      add("pending_refund", "Resolve the pending refund before cutover review.", {
        orderId: String(refund.order_id),
      });
  }
  for (const order of evidence.orders) {
    if (order.kind === "team-fee") {
      const fee = objectValue(order.snapshot.teamFee);
      try {
        if (
          order.snapshot.kind !== "team-fee" ||
          !fee ||
          typeof fee.teamId !== "string" ||
          typeof fee.playerId !== "string" ||
          basis.playerAliases.filter(
            (alias) => alias.teamId === fee.teamId && alias.playerId === fee.playerId,
          ).length !== 1
        )
          throw new Error("Missing original team/player pair");
        const { identity } = resolveFinancialAgreement(basis, {
          teamId: fee.teamId,
          playerId: fee.playerId,
        });
        if (
          (fee.financialAgreementId !== undefined || fee.financialTeamSeasonId !== undefined) &&
          (fee.financialAgreementId !== identity.id ||
            fee.financialTeamSeasonId !== identity.teamSeasonId)
        )
          throw new Error("Conflicting stable financial identity");
      } catch {
        add(
          "unresolved_team_fee_identity",
          "The stored snapshot.teamFee teamId/playerId pair or stable IDs do not resolve to the original financial agreement. Review the historical transfer/alias explicitly; do not reassign it to the current roster.",
          { orderId: order.id },
        );
      }
    }
    const bookings = evidence.bookings.filter((b) => b.order_id === order.id);
    const window = objectValue(order.snapshot.bookingWindow);
    const lesson =
      ["lesson", "package", "membership"].includes(order.kind) ||
      (Boolean(window) && order.kind !== "cage" && order.kind !== "cage-plan") ||
      bookings.some((b) => Boolean(b.coach_id) || Boolean(b.lesson_config));
    const attempts = evidence.attempts.filter((a) => a.order_id === order.id);
    const payments = evidence.payments.filter((p) => p.order_id === order.id);
    if (!lesson) continue;
    if (order.status === "payment_review")
      add("payment_review", "Resolve the paid lesson order under payment review before cutover.", {
        orderId: order.id,
      });
    if (order.status === "pending_fee" || order.subscription_setup_status === "pending")
      add(
        "incomplete_payment_setup",
        "Resolve partially paid or pending subscription setup before cutover.",
        { orderId: order.id },
      );
    const paid =
      order.status === "paid" ||
      Boolean(order.paid_at) ||
      payments.some((p) => p.status === "COMPLETED");
    const final = ["refunded", "cancelled", "canceled"].includes(order.status);
    if (paid && !final) {
      if (
        order.payment_provider === "square" &&
        !payments.some(
          (payment) =>
            payment.id === order.square_payment_id &&
            payment.status === "COMPLETED" &&
            payment.environment === order.payment_environment,
        )
      )
        add(
          "unreconciled_paid_order",
          "The paid Square order lacks its matching reconciled completed base payment.",
          { orderId: order.id },
        );
      const expectedProduct =
        (order.snapshot.assessment && order.snapshot.recurring) ||
        Number(order.snapshot.setupCents) > 0
          ? order.snapshot.discipline === "Hitting"
            ? "s9"
            : "s1"
          : order.snapshot.productId;
      const fulfilledBooking = bookings.some(
        (b) =>
          ["confirmed", "completed"].includes(String(b.status)) &&
          (!window ||
            (b.coach_id === (window.coachId || null) &&
              b.product_id === expectedProduct &&
              +new Date(String(b.starts_at)) === +new Date(String(window.start)) &&
              +new Date(String(b.ends_at)) === +new Date(String(window.end)))),
      );
      const needsCredits = Number(order.snapshot.credits) > 0;
      const fulfilledCredits = evidence.grants.some(
        (g) => g.order_id === order.id && g.kind === "lesson" && Number(g.quantity) > 0,
      );
      if (
        order.status !== "paid" ||
        ((window || order.kind === "lesson") && !fulfilledBooking) ||
        (needsCredits && !fulfilledCredits) ||
        (!window && !needsCredits && !fulfilledBooking)
      )
        add(
          "paid_unfulfilled_lesson",
          "Paid lesson fulfillment is absent or ambiguous; reconcile its original outcome before cutover.",
          { orderId: order.id },
        );
    }
    // Only truly untouched quotes can acquire current terms immediately before a
    // future charge. Existing pins and even declined attempts are not rewritten.
    if (
      order.status === "pending" &&
      !order.snapshot.financialLessonAdmission &&
      !attempts.length &&
      !payments.length &&
      !order.paid_at &&
      !order.square_payment_id &&
      !order.square_fee_payment_id &&
      !order.payment_intent_id &&
      !order.checkout_session_id
    )
      untouchedQuoteIds.push(order.id);
    else if (
      ["pending", "expired"].includes(order.status) &&
      !paid &&
      (order.payment_intent_id || order.checkout_session_id)
    )
      add(
        "legacy_provider_checkout",
        "Reconcile this existing provider checkout before assigning any new financial terms.",
        { orderId: order.id },
      );
  }
  for (const booking of evidence.bookings) {
    const isLesson =
      Boolean(booking.coach_id) ||
      Boolean(booking.lesson_config) ||
      inputs.compensation.services?.some(
        (service) => service.id === booking.product_id && service.kind === "lesson",
      );
    if (!isLesson || evidence.bindings.some((b) => b.booking_id === booking.id)) continue;
    const bookingId = String(booking.id);
    const originalOrder = evidence.orders.find((o) => o.id === booking.order_id);
    if (!booking.order_id || !originalOrder) {
      add(
        "lesson_order_missing",
        "This historical lesson needs an explicit reviewed attribution protocol because the binding schema requires its original order.",
        { bookingId },
      );
      continue;
    }
    if (
      originalOrder.snapshot.financialLessonAdmission != null ||
      evidence.recognitions.some((recognition) => recognition.booking_id === booking.id)
    ) {
      add(
        "preserve_original_lesson_attribution",
        "This unbound lesson already has a pinned order or financial recognition. Its original version needs a separate preservation review; no replacement binding is proposed.",
        { bookingId, orderId: originalOrder.id },
      );
      continue;
    }
    // A failed approved-terms query must not poison the outer read transaction.
    await tx.query("savepoint financial_cutover_terms_preview");
    try {
      const [row] = await tx<{
        terms: SourceRow;
      }>`select approved_financial_lesson_terms(${JSON.stringify(inputs)}::jsonb,${booking.coach_id},${booking.product_id},${booking.ends_at}::timestamptz) as terms`;
      if (!row?.terms) throw new Error("Missing approved terms");
      const { lesson_config: _lessonConfig, ...originalBooking } = booking;
      bindingPlan.push({
        bookingId,
        orderId: String(booking.order_id),
        basisId: BASIS_ID,
        basisVersion,
        originalBooking,
        approvedTerms: row.terms,
      });
      await tx.query("release savepoint financial_cutover_terms_preview");
    } catch {
      await tx.query("rollback to savepoint financial_cutover_terms_preview");
      await tx.query("release savepoint financial_cutover_terms_preview");
      add(
        "lesson_terms_unavailable",
        "Original instructor/service compensation is missing or ambiguous; owner review is required without fabricating terms.",
        { bookingId, orderId: String(booking.order_id) },
      );
    }
  }
  if (
    bindingPlan.length ||
    blockers.some((b) =>
      [
        "lesson_order_missing",
        "lesson_terms_unavailable",
        "preserve_original_lesson_attribution",
      ].includes(b.code),
    )
  )
    add(
      "applied_reviewed_bindings_required",
      "Existing unbound lessons still fall back to immutable version 1. Activation requires separately reviewed, applied bindings to the intended captured version; this dry run applies nothing.",
    );
  add(
    "explicit_activation_required",
    "Production remains captured/null. This report cannot activate consumers or relax schema constraints.",
  );
  return { readyForActivation: false as const, blockers, bindingPlan, untouchedQuoteIds };
}

async function captureRefreshReview(tx: Sql, basis: FinancialBasis) {
  const captured = await captureInputs(tx);
  assertRefreshIdentities(basis, captured.inputs);
  const evidence = await captureCutoverEvidence(tx);
  const sourceChanges = financialSourceChanges(basis.inputs, captured.inputs);
  const readinessDigest = digest(evidence);
  const plan = await cutoverPlan(tx, basis, captured.inputs, basis.version + 1, evidence);
  const refreshBlockers = plan.blockers.filter(
    (b) =>
      ![
        "explicit_activation_required",
        "applied_reviewed_bindings_required",
        "lesson_order_missing",
        "lesson_terms_unavailable",
      ].includes(b.code),
  );
  if (evidence.versions.some((version) => version.version > 1 && !version.audited_refresh))
    refreshBlockers.push({
      code: "saved_financial_amendment",
      detail:
        "An existing version contains a financial amendment or alias admission, rather than an audited captured refresh. Preserve and review those changes separately; raw refresh cannot overwrite them.",
    });
  for (const binding of evidence.bindings)
    refreshBlockers.push({
      code: "existing_lesson_binding",
      bookingId: String(binding.booking_id),
      detail: "Refresh cannot replace already-bound immutable lesson attribution.",
    });
  for (const recognition of evidence.recognitions)
    refreshBlockers.push({
      code: "existing_lesson_recognition",
      bookingId: String(recognition.booking_id),
      detail: "Refresh cannot replace already-recognized immutable lesson attribution.",
    });
  for (const order of evidence.orders.filter((o) => o.snapshot.financialLessonAdmission != null))
    refreshBlockers.push({
      code: "existing_order_pin",
      orderId: order.id,
      detail:
        "Refresh cannot replace an existing immutable order admission pin, including an uncharged quote.",
    });
  const billing = basis.inputs.billing;
  if (
    billing.agreementGuardians?.length ||
    billing.instructorAccess?.length ||
    billing.payrollAccess?.length ||
    billing.accounts.some(
      (a) => a.admittedAgreementIds !== undefined || a.admittedTeamIds !== undefined,
    )
  )
    refreshBlockers.push({
      code: "scoped_financial_admission",
      detail:
        "Existing explicit financial access admissions require a separately reviewed preservation protocol; refresh cannot silently discard them.",
    });
  const reviewDigest = digest({
    expectedVersion: basis.version,
    priorPayloadDigest: digest(basis.inputs),
    originalSourceDigest: basis.sourceDigest,
    identities: {
      teams: basis.teams,
      agreements: basis.agreements,
      teamAliases: basis.teamAliases,
      playerAliases: basis.playerAliases,
    },
    sourceClubRevision: captured.sourceClubRevision,
    sourceDigest: captured.sourceDigest,
    sourceChanges,
    readinessDigest,
    bindingPlan: plan.bindingPlan,
    refreshBlockers,
  });
  return {
    captured,
    review: {
      expectedVersion: basis.version,
      proposedVersion: basis.version + 1,
      sourceClubRevision: captured.sourceClubRevision,
      sourceDigest: captured.sourceDigest,
      // Complete owner-private differential; never truncate this confirmation
      // material or place it in an operational route/projection.
      sourceChanges,
      readinessDigest,
      reviewDigest,
      refreshAllowed: refreshBlockers.length === 0,
      refreshBlockers,
      ...plan,
    },
  };
}

/** Explicit owner-private exact differential; no writes, binding or charge. */
export async function previewFinancialBasisRefresh(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const basis = await readBasis(tx);
    if (!basis) throw new Error("Financial basis is not initialized.");
    return (await captureRefreshReview(tx, basis)).review;
  });
}

/** Captured-only resnapshot, never an activation or binding backfill. Original
 * source provenance and all identities/versions remain immutable. The audit is
 * the append-only provenance for THIS recapture, not a rewritten initialization. */
export async function refreshFinancialBasisForOwner(
  sql: Sql,
  userId: string,
  command: {
    expectedVersion: number;
    sourceClubRevision: number;
    sourceDigest: string;
    readinessDigest: string;
    reviewDigest: string;
    reason: string;
  },
) {
  assertVersion(command.expectedVersion);
  const reason = reasonFor(command.reason);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const basis = await readBasis(tx, true);
    if (!basis || basis.version !== command.expectedVersion)
      throw new Error("Financial basis changed. Review a fresh captured refresh preview.");
    const { captured, review } = await captureRefreshReview(tx, basis);
    if (
      command.sourceClubRevision !== review.sourceClubRevision ||
      command.sourceDigest !== review.sourceDigest
    )
      throw new Error("Financial source inputs changed. Review a fresh captured refresh preview.");
    if (
      command.readinessDigest !== review.readinessDigest ||
      command.reviewDigest !== review.reviewDigest
    )
      throw new Error(
        "Financial cutover readiness changed. Review a fresh captured refresh preview.",
      );
    if (!review.refreshAllowed)
      throw new Error(
        "Financial captured refresh is blocked. Resolve the reviewed attribution/provider blockers first.",
      );
    const version = review.proposedVersion;
    await tx`insert into financial_basis_versions(basis_id,version,payload,payload_digest,changed_by,reason)
      values(${BASIS_ID},${version},${JSON.stringify(captured.inputs)}::jsonb,${captured.sourceDigest},${userId},${reason})`;
    const changed = await tx`update financial_basis_state set current_version=${version}
      where id=${BASIS_ID} and current_version=${command.expectedVersion}
        and activation_state='captured' and active_version is null returning id`;
    if (changed.length !== 1)
      throw new Error("Financial basis changed. Review a fresh captured refresh preview.");
    const receipt = {
      version,
      activationState: "captured" as const,
      activeVersion: null,
      sourceClubRevision: basis.sourceClubRevision,
      sourceDigest: basis.sourceDigest,
      payloadDigest: captured.sourceDigest,
      refreshedSourceClubRevision: captured.sourceClubRevision,
      refreshedSourceDigest: captured.sourceDigest,
      sourceChangesDigest: digest(review.sourceChanges),
      readinessDigest: review.readinessDigest,
      reviewDigest: review.reviewDigest,
    };
    const [audit] = await tx<{
      id: string;
    }>`insert into finance_audit(actor_id,record_id,action,reason,before_state,after_state)
      values(${userId},${BASIS_ID},'Captured financial basis refresh',${reason},
        ${JSON.stringify({ version: basis.version, payloadDigest: digest(basis.inputs) })}::jsonb,
        ${JSON.stringify(receipt)}::jsonb) returning id::text`;
    return { ...receipt, auditId: audit.id };
  });
}

/** Re-review after refresh. Pins/bindings/ledgers and provider state are never
 * written. A source drift blocker requires another explicit owner refresh. */
export async function previewFinancialBasisCutoverReadinessForOwner(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const basis = await readBasis(tx);
    if (!basis) throw new Error("Financial basis is not initialized.");
    const captured = await captureInputs(tx);
    assertRefreshIdentities(basis, captured.inputs);
    const evidence = await captureCutoverEvidence(tx);
    const plan = await cutoverPlan(tx, basis, basis.inputs, basis.version, evidence);
    if (captured.sourceDigest !== digest(basis.inputs))
      plan.blockers.push({
        code: "source_changed_since_capture",
        detail:
          "Operational source inputs changed since the selected captured version; review a fresh explicit refresh before cutover.",
      });
    const readinessDigest = digest(evidence);
    return {
      basisVersion: basis.version,
      sourceClubRevision: captured.sourceClubRevision,
      sourceDigest: captured.sourceDigest,
      readinessDigest,
      reviewDigest: digest({
        basisVersion: basis.version,
        payloadDigest: digest(basis.inputs),
        sourceDigest: captured.sourceDigest,
        readinessDigest,
        bindingPlan: plan.bindingPlan,
      }),
      ...plan,
    };
  });
}

function activationRelease() {
  const release = process.env.APP_BUILD_SOURCE_COMMIT || "";
  return {
    release,
    clean: /^[a-f0-9]{40}$/.test(release) && process.env.APP_BUILD_SOURCE_DIRTY === "false",
  };
}
function sameActivationInstant(a: Json | undefined, b: Json | undefined) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Number.isFinite(+new Date(a)) &&
    +new Date(a) === +new Date(b)
  );
}
async function activationVersionInputs(tx: Sql, version: Json | undefined, current: number) {
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > current
  )
    throw Error("Invalid immutable version");
  const [saved] = await tx<{
    payload: FinancialInputs;
    payload_digest: string;
  }>`select payload,payload_digest from financial_basis_versions where basis_id=${BASIS_ID} and version=${version}`;
  if (!saved || digest(saved.payload) !== saved.payload_digest)
    throw Error("Invalid immutable payload");
  return saved.payload;
}
async function existingBindingBlockers(tx: Sql, basis: FinancialBasis, evidence: CutoverEvidence) {
  const blockers: FinancialCutoverBlocker[] = [];
  for (const binding of evidence.bindings) {
    await tx.query("savepoint financial_activation_binding_check");
    try {
      const original = objectValue(binding.original_booking);
      const booking = evidence.bookings.find((b) => b.id === binding.booking_id);
      const order = evidence.orders.find((o) => o.id === binding.order_id);
      if (
        binding.basis_id !== BASIS_ID ||
        !original ||
        !booking ||
        !order ||
        binding.order_id !== booking.order_id ||
        original.id !== booking.id ||
        original.order_id !== booking.order_id ||
        ["user_id", "athlete_id", "coach_id", "product_id"].some(
          (key) => (original[key] ?? null) !== (booking[key] ?? null),
        ) ||
        !sameActivationInstant(original.starts_at, booking.starts_at) ||
        !sameActivationInstant(original.ends_at, booking.ends_at)
      )
        throw Error("Original binding identity changed");
      const inputs = await activationVersionInputs(tx, binding.basis_version, basis.version);
      const [approved] = await tx<{
        terms: SourceRow;
      }>`select approved_financial_lesson_terms(${JSON.stringify(inputs)}::jsonb,${original.coach_id},${original.product_id},${original.ends_at}::timestamptz) as terms`;
      if (!approved?.terms || digest(approved.terms) !== digest(binding.approved_terms))
        throw Error("Original terms changed");
      const pin = objectValue(order.snapshot.financialLessonAdmission);
      // A package may fund later appointments; only an exact original appointment
      // pin can constrain this booking's saved version.
      if (
        pin &&
        pin.coachId === original.coach_id &&
        pin.productId === original.product_id &&
        sameActivationInstant(pin.startsAt, original.starts_at) &&
        sameActivationInstant(pin.endsAt, original.ends_at) &&
        pin.basisVersion !== binding.basis_version
      )
        throw Error("Pinned version changed");
      if (
        evidence.recognitions.some(
          (r) =>
            r.booking_id === binding.booking_id &&
            (r.basis_id !== binding.basis_id || r.basis_version !== binding.basis_version),
        )
      )
        throw Error("Recognition version changed");
      await tx.query("release savepoint financial_activation_binding_check");
    } catch {
      await tx.query("rollback to savepoint financial_activation_binding_check");
      await tx.query("release savepoint financial_activation_binding_check");
      blockers.push({
        code: "inconsistent_existing_binding",
        bookingId: String(binding.booking_id),
        detail:
          "An existing immutable binding does not match its original booking, approved terms or recognition. Activation never replaces it.",
      });
    }
  }
  return blockers;
}
async function activationOrderBlockers(tx: Sql, basis: FinancialBasis, evidence: CutoverEvidence) {
  const blockers: FinancialCutoverBlocker[] = [];
  for (const order of evidence.orders) {
    const window = objectValue(order.snapshot.bookingWindow);
    const lesson =
      ["lesson", "package", "membership"].includes(order.kind) ||
      Boolean(window && !["cage", "cage-plan"].includes(order.kind));
    const rawPin = order.snapshot.financialLessonAdmission;
    if (
      lesson &&
      order.status === "pending" &&
      rawPin == null &&
      evidence.attempts.some((a) => a.order_id === order.id)
    )
      blockers.push({
        code: "unpinned_attempted_order",
        orderId: order.id,
        detail:
          "This pending quote already had a provider attempt, including a decline. Resolve it separately; activation cannot assign a new pin.",
      });
    if (rawPin == null) continue;
    await tx.query("savepoint financial_activation_pin_check");
    try {
      const pin = objectValue(rawPin);
      const product =
        (order.snapshot.assessment && order.snapshot.recurring) ||
        Number(order.snapshot.setupCents) > 0
          ? order.snapshot.discipline === "Hitting"
            ? "s9"
            : "s1"
          : order.snapshot.productId;
      if (
        !pin ||
        !window ||
        pin.coachId !== window.coachId ||
        pin.productId !== product ||
        !sameActivationInstant(pin.startsAt, window.start) ||
        !sameActivationInstant(pin.endsAt, window.end) ||
        +new Date(String(pin.endsAt)) <= +new Date(String(pin.startsAt))
      )
        throw Error("Pin identity mismatch");
      const inputs = await activationVersionInputs(tx, pin.basisVersion, basis.version);
      const [approved] = await tx<{
        terms: SourceRow;
      }>`select approved_financial_lesson_terms(${JSON.stringify(inputs)}::jsonb,${pin.coachId},${pin.productId},${pin.endsAt}::timestamptz) as terms`;
      if (!approved?.terms) throw Error("Pin terms unavailable");
      await tx.query("release savepoint financial_activation_pin_check");
    } catch {
      await tx.query("rollback to savepoint financial_activation_pin_check");
      await tx.query("release savepoint financial_activation_pin_check");
      blockers.push({
        code: "inconsistent_existing_order_pin",
        orderId: order.id,
        detail:
          "An immutable order pin does not match its original appointment or saved approved version. Activation never replaces it.",
      });
    }
  }
  return blockers;
}
/** Compare complete serialized outputs except documented presentation metadata. */
function comparableActivationOutputs(value: {
  fees: { teams: Array<{ basisVersion?: number }>; business: { basisVersion?: number } | null };
  finance: { basisVersion?: number };
  facility: unknown;
}): unknown {
  const serialized = JSON.parse(JSON.stringify(value)) as typeof value;
  // Identically named fields inside stored records/history/audit remain compared.
  delete serialized.finance.basisVersion;
  for (const team of serialized.fees.teams) delete team.basisVersion;
  if (serialized.fees.business) delete serialized.fees.business.basisVersion;
  return serialized;
}
async function activationOutputs(tx: Sql, userId: string, asOf: string) {
  const { loadFinancialContextInTransaction } = await import("./context.server");
  const { feeWorkspaceInTransaction } = await import("../teams/fee.server");
  const { financeWorkspaceInTransaction, records } = await import("./store.server");
  const { facilityPayables } = await import("./facility.server");
  const context = await loadFinancialContextInTransaction(tx, userId, "owner");
  return comparableActivationOutputs({
    fees: await feeWorkspaceInTransaction(tx, context, asOf),
    finance: await financeWorkspaceInTransaction(tx, context, asOf),
    facility: await facilityPayables(tx, asOf, await records(tx), context),
  });
}
async function captureActivationReview(tx: Sql, userId: string, basis: FinancialBasis) {
  const captured = await captureInputs(tx);
  assertRefreshIdentities(basis, captured.inputs);
  const evidence = await captureCutoverEvidence(tx);
  await tx.query(
    "lock table finance_state,billing_invoices,commerce_policy,operational_lesson_completions in share mode",
  );
  const plan = await cutoverPlan(tx, basis, basis.inputs, basis.version, evidence);
  const blockers = plan.blockers.filter(
    (b) => !["explicit_activation_required", "applied_reviewed_bindings_required"].includes(b.code),
  );
  if (captured.sourceDigest !== digest(basis.inputs))
    blockers.push({
      code: "source_changed_since_capture",
      detail:
        "Financial source inputs changed since this captured version. Review a separate explicit refresh before activation.",
    });
  const build = activationRelease();
  if (!build.clean)
    blockers.push({
      code: "unidentified_release",
      detail:
        "Activation requires a clean, identified release matching the reviewed source commit.",
    });
  const [schema] = await tx<{
    ready: boolean;
  }>`select exists(select 1 from pg_constraint where conrelid='financial_basis_state'::regclass and conname='financial_basis_active_version' and contype='f') as ready`;
  if (!schema?.ready)
    blockers.push({
      code: "activation_schema_unavailable",
      detail: "The reviewed activation schema migration is not installed.",
    });
  blockers.push(
    ...(await existingBindingBlockers(tx, basis, evidence)),
    ...(await activationOrderBlockers(tx, basis, evidence)),
  );
  const asOf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  let outputDigest = digest({ unavailable: true });
  await tx.query("savepoint financial_activation_output_review");
  try {
    outputDigest = digest(await activationOutputs(tx, userId, asOf));
    await tx.query("release savepoint financial_activation_output_review");
  } catch {
    await tx.query("rollback to savepoint financial_activation_output_review");
    await tx.query("release savepoint financial_activation_output_review");
    blockers.push({
      code: "financial_projection_unavailable",
      detail:
        "The complete current fee, finance or compensation projection could not be verified. Resolve it before activation.",
    });
  }
  const readinessDigest = digest(evidence),
    payloadDigest = digest(basis.inputs);
  const reviewDigest = digest({
    asOf,
    outputDigest,
    userId,
    release: build.release,
    clean: build.clean,
    schemaReady: schema?.ready === true,
    expectedVersion: basis.version,
    payloadDigest,
    originalSourceDigest: basis.sourceDigest,
    identities: {
      teams: basis.teams,
      agreements: basis.agreements,
      teamAliases: basis.teamAliases,
      playerAliases: basis.playerAliases,
    },
    sourceClubRevision: captured.sourceClubRevision,
    sourceDigest: captured.sourceDigest,
    readinessDigest,
    bindingPlan: plan.bindingPlan,
    untouchedQuoteIds: plan.untouchedQuoteIds,
    blockers,
  });
  return {
    expectedVersion: basis.version,
    expectedRelease: build.release,
    asOf,
    outputDigest,
    sourceClubRevision: captured.sourceClubRevision,
    sourceDigest: captured.sourceDigest,
    payloadDigest,
    readinessDigest,
    reviewDigest,
    readyForActivation: blockers.length === 0,
    blockers,
    bindingPlan: plan.bindingPlan,
    untouchedQuoteIds: plan.untouchedQuoteIds,
  };
}
/** Owner-private review; never writes a pin, binding, financial source or grant. */
export async function previewFinancialBasisActivationForOwner(sql: Sql, userId: string) {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const basis = await readBasis(tx);
    if (!basis) throw Error("Financial basis is not initialized.");
    return captureActivationReview(tx, userId, basis);
  });
}
/** Explicit exact-review activation only; no provider I/O or changed obligations. */
export async function activateFinancialBasisForOwner(sql: Sql, userId: string, raw: unknown) {
  const command = financialBasisActivationInput.parse(raw);
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    await requireBasisOwner(tx, userId);
    const basis = await readBasis(tx, true);
    if (!basis || basis.version !== command.expectedVersion)
      throw Error("Financial basis changed. Review activation again.");
    const review = await captureActivationReview(tx, userId, basis);
    if (
      command.asOf !== review.asOf ||
      command.outputDigest !== review.outputDigest ||
      command.expectedRelease !== review.expectedRelease ||
      command.sourceClubRevision !== review.sourceClubRevision ||
      command.sourceDigest !== review.sourceDigest ||
      command.readinessDigest !== review.readinessDigest ||
      command.reviewDigest !== review.reviewDigest
    )
      throw Error("Release, source or financial readiness changed. Review activation again.");
    if (!review.readyForActivation)
      throw Error(
        "Financial activation is blocked. Resolve the reviewed source, attribution or provider blockers first.",
      );
    for (const binding of review.bindingPlan)
      await tx`insert into financial_lesson_bindings(booking_id,basis_id,basis_version,order_id,original_booking,approved_terms)
        values(${binding.bookingId},${BASIS_ID},${binding.basisVersion},${binding.orderId},${JSON.stringify(binding.originalBooking)}::jsonb,${JSON.stringify(binding.approvedTerms)}::jsonb)`;
    const changed =
      await tx`update financial_basis_state set activation_state='active',active_version=current_version
      where id=${BASIS_ID} and current_version=${command.expectedVersion} and activation_state='captured' and active_version is null returning id`;
    if (changed.length !== 1) throw Error("Financial basis changed. Review activation again.");
    if (digest(await activationOutputs(tx, userId, review.asOf)) !== review.outputDigest)
      throw Error(
        "Financial outputs differ after the proposed activation. All activation changes were rolled back; review the financial projections.",
      );
    const receipt = {
      asOf: review.asOf,
      outputDigest: review.outputDigest,
      version: basis.version,
      activationState: "active" as const,
      activeVersion: basis.version,
      release: review.expectedRelease,
      payloadDigest: review.payloadDigest,
      sourceClubRevision: review.sourceClubRevision,
      sourceDigest: review.sourceDigest,
      readinessDigest: review.readinessDigest,
      reviewDigest: review.reviewDigest,
      bindingPlanDigest: digest(review.bindingPlan),
      appliedBookingIds: review.bindingPlan.map((b) => b.bookingId),
      untouchedQuoteIds: review.untouchedQuoteIds,
    };
    const [audit] = await tx<{
      id: string;
    }>`insert into finance_audit(actor_id,record_id,action,reason,before_state,after_state)
      values(${userId},${BASIS_ID},'Activate reviewed financial basis',${command.reason},
        ${JSON.stringify({ version: basis.version, activationState: "captured", activeVersion: null, payloadDigest: review.payloadDigest })}::jsonb,
        ${JSON.stringify(receipt)}::jsonb) returning id::text`;
    return { ...receipt, auditId: audit.id };
  });
}
