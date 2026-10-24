import { withoutRetiredMembershipPricing } from "../teams/retired-membership";
import { releasedMaster, linkedPricingDraft } from "../teams/pricing-defaults";
/** Internal financial authority selection. No endpoint, activation command, or
 * caller-controlled mode. Full contexts must never leave server consumers. */
import type { Sql } from "../db";
import { randomUUID } from "node:crypto";
import { newCoachId } from "../coach-id.server";
import type { ClubRecord, Team } from "../teams/types";
import { feeAction, businessSchema, type FeePlan, type FeeBusiness } from "../teams/fee-contracts";
import { masterSchema, normalizePOMaster, type MasterMatrix } from "../teams/budget-matrix";
import { activityInput, type TeamActivity } from "../teams/activity-contracts";
import { seasonHotelNights, seasonEntryCosts } from "../teams/travel-budget";
import type { z } from "zod";
import {
  financialBasisDigest,
  hasFrozenFinancialGuardian,
  resolveFinancialAgreement,
  resolveFinancialTeam,
  type FinancialBasis,
  type FinancialInputs,
} from "./basis.server";
import { financialPrincipalInTransaction, type FinancialPrincipal } from "./principal.server";
import { lockFinancialExecution } from "./execution.server";
import { financialClubTermsChangeSchema, financialAdmissionSchema } from "./context-contracts";
export { lockFinancialExecution } from "./execution.server";
export type { FinancialPrincipal } from "./principal.server";

export type FinancialReadContext = {
  mode: "legacy" | "basis";
  clubExists: boolean;
  version: number | null;
  basis: FinancialBasis | null;
  club: ClubRecord;
  feePlans: { team_id: string; revision: number; payload: FeePlan }[];
  feeBusiness: { id: string; revision: number; payload: FeeBusiness }[];
  budgetMaster: { id: string; revision: number; payload: MasterMatrix }[];
  activities: { id: string; team_id: string; revision: number; payload: TeamActivity }[];
  compensation: FinancialInputs["compensation"] | null;
};
export type FinancialContext = FinancialReadContext & { principal: FinancialPrincipal };
export type ProviderFinancialContext = FinancialReadContext & { providerOrderId: string };
type Intent = "read" | "owner";
type InternalContext = {
  tx: Sql;
  initial: FinancialReadContext;
  userId?: string;
  providerOrderId?: string;
};
const issued = new WeakMap<object, InternalContext>();
const ID = "oklahoma-prospects";
const clone = <T>(value: T): T => structuredClone(value);

async function sourceInTransaction(tx: Sql): Promise<FinancialReadContext> {
  const [state] = await tx<{
    current_version: number;
    activation_state: string;
    active_version: number | null;
    source_club_revision: number;
    source_digest: string;
  }>`select current_version,activation_state,active_version,source_club_revision,source_digest from financial_basis_state where id=${ID} for update`;
  if (!state || (state.activation_state === "captured" && state.active_version === null)) {
    const [row] = await tx<{
      payload: ClubRecord;
      rev: number;
      demo: boolean;
    }>`select payload,rev,demo from club_state where id=${ID} for update`;
    const club: ClubRecord = row
      ? { ...row.payload, _rev: row.rev, _demo: row.demo }
      : {
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
          teams: [],
          catalog: [],
          uniforms: [],
          leads: [],
          alumni: [],
          notifications: [],
          audit: [],
          onboarding: { started: false },
          _rev: 0,
          _savedAt: "",
          _demo: false,
        };
    return {
      mode: "legacy",
      clubExists: Boolean(row),
      version: null,
      basis: null,
      club,
      feePlans: await tx`select team_id,revision,payload from team_fee_plans order by team_id`,
      feeBusiness: await tx`select id,revision,payload from team_fee_business order by id`,
      budgetMaster: await tx`select id,revision,payload from team_budget_master order by id`,
      activities: await tx`select id,team_id,revision,payload from team_activities order by id`,
      compensation: null,
    };
  }
  if (
    state.activation_state !== "active" ||
    !Number.isSafeInteger(state.active_version) ||
    state.active_version! < 1 ||
    state.active_version !== state.current_version
  )
    throw new Error("Financial activation state is unavailable or inconsistent.");
  const [row] = await tx<{
    payload: FinancialInputs;
    payload_digest: string;
  }>`select payload,payload_digest from financial_basis_versions where basis_id=${ID} and version=${state.active_version}`;
  if (
    !row ||
    row.payload.schemaVersion !== 1 ||
    financialBasisDigest(row.payload) !== row.payload_digest
  )
    throw new Error("Financial basis version is unavailable or inconsistent.");
  const basis: FinancialBasis = {
    version: state.active_version!,
    activationState: "active",
    activeVersion: state.active_version,
    sourceClubRevision: state.source_club_revision,
    sourceDigest: state.source_digest,
    inputs: row.payload,
    teams:
      await tx`select id,original_team_id as "originalTeamId" from financial_team_seasons where basis_id=${ID} and created_version<=${state.active_version} order by original_team_id`,
    agreements:
      await tx`select id,team_season_id as "teamSeasonId",original_player_id as "originalPlayerId" from financial_player_agreements where basis_id=${ID} and created_version<=${state.active_version} order by id`,
    teamAliases:
      await tx`select legacy_team_id as "teamId",team_season_id as "teamSeasonId" from financial_team_aliases where basis_id=${ID} and created_version<=${state.active_version} order by legacy_team_id`,
    playerAliases:
      await tx`select legacy_team_id as "teamId",legacy_player_id as "playerId",agreement_id as "agreementId" from financial_player_aliases where basis_id=${ID} and created_version<=${state.active_version} order by legacy_team_id,legacy_player_id`,
  };
  // Separate detached views: consumer normalization must not alter the saved
  // baseline used to authorize and commit a narrowly scoped change.
  return {
    mode: "basis",
    clubExists: true,
    version: basis.version,
    basis: clone(basis),
    club: clone(basis.inputs.club),
    feePlans: clone(basis.inputs.feePlans),
    feeBusiness: clone(basis.inputs.feeBusiness) as FinancialReadContext["feeBusiness"],
    budgetMaster: clone(basis.inputs.budgetMaster) as FinancialReadContext["budgetMaster"],
    activities: clone(basis.inputs.activities),
    compensation: clone(basis.inputs.compensation),
  };
}

/** Internal projection for a caller that has locked current team-scoped access.
 * Does not grant a financial principal or expose costs, policies or player accounts. */
export async function publishedTeamPriceInTransaction(tx: Sql, teamId: string) {
  const source = await sourceInTransaction(tx);
  const team = source.club.teams.find((t) => t.id === teamId);
  const plan = source.feePlans.find((p) => p.team_id === teamId)?.payload;
  const published = plan?.published;
  if (!team || !published) return null;
  return {
    full: published.full,
    ...((plan.publishedBudget?.poEnabled ?? plan.budget.poEnabled ?? team.sport === "baseball")
      ? { po: published.po }
      : {}),
    finalDue: published.finalDue,
    revision: published.revision,
    at: published.at,
  };
}

export async function loadFinancialContextInTransaction(
  tx: Sql,
  userId: string,
  intent: Intent = "read",
): Promise<FinancialContext> {
  await lockFinancialExecution(tx);
  // Security first, before loading the private source, including in captured mode.
  const current = await financialPrincipalInTransaction(tx, userId);
  if (intent === "owner" && !current.owner)
    throw new Error("Admin financial owner access required.");
  const source = await sourceInTransaction(tx);
  const principal = source.basis
    ? await financialPrincipalInTransaction(tx, userId, source.basis.inputs.billing)
    : current;
  const context = { ...source, principal };
  issued.set(context, { tx, initial: clone(source), userId });
  return context;
}

export async function withFinancialContext<T>(
  sql: Sql,
  userId: string,
  intent: Intent,
  work: (tx: Sql, context: FinancialContext) => Promise<T>,
): Promise<T> {
  return sql.transaction(async (tx) => {
    await lockFinancialExecution(tx);
    const context = await loadFinancialContextInTransaction(tx, userId, intent);
    return work(tx, context);
  });
}

export function isFinancialCoach(context: FinancialContext, team: Team) {
  const email = context.principal.email;
  // New guardian admissions cannot inherit historical coaching authority by email.
  const saved = context.basis?.inputs.billing.accounts.find(
    (a) => a.id === context.principal.userId,
  );
  if (
    saved &&
    (saved.admittedAgreementIds || saved.admittedTeamIds) &&
    !saved.admittedTeamIds?.includes(team.id)
  )
    return false;
  return (
    Boolean(email) &&
    (team.coachEmail.trim().toLowerCase() === email ||
      team.staff.some((s) => s.email.trim().toLowerCase() === email && /coach/i.test(s.role)))
  );
}
export function isFinancialGuardian(context: FinancialContext, teamId: string, playerId: string) {
  if (context.basis) {
    const { identity } = resolveFinancialAgreement(context.basis, { teamId, playerId });
    return hasFrozenFinancialGuardian(context.basis, identity.id, context.principal.userId);
  }
  const p = context.club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === playerId);
  const me = context.principal;
  return Boolean(
    p &&
    ((me.role !== "player" && p.parents.some((g) => g.email.trim().toLowerCase() === me.email)) ||
      (me.role === "player" ? me.guardianHouseholdIds : me.familyIds).includes(p.familyId)),
  );
}

function internal(tx: Sql, context: FinancialReadContext): InternalContext {
  const value = issued.get(context);
  if (!value || value.tx !== tx)
    throw new Error("A financial context from this transaction is required.");
  return value;
}
/** Internal projection access: use the transaction-issued source, never caller
 * mutations to its detached view, and recheck current authenticated authority. */
export async function financialReadSnapshotInTransaction(
  tx: Sql,
  context: FinancialContext,
  intent: Intent,
): Promise<FinancialContext> {
  const saved = internal(tx, context);
  if (!saved.userId) throw new Error("Authenticated financial read required.");
  const principal = await financialPrincipalInTransaction(
    tx,
    saved.userId,
    saved.initial.basis?.inputs.billing,
  );
  if (intent === "owner" && !principal.owner)
    throw new Error("Admin financial owner access required.");
  const snapshot = { ...clone(saved.initial), principal };
  issued.set(snapshot, { ...saved, initial: clone(saved.initial) });
  return snapshot;
}

async function humanBaseline(tx: Sql, context: FinancialContext, expectedBasisVersion?: number) {
  const saved = internal(tx, context);
  if (!saved.userId) throw new Error("Authenticated financial command required.");
  const initial = saved.initial;
  const principal = await financialPrincipalInTransaction(
    tx,
    saved.userId,
    initial.basis?.inputs.billing,
  );
  if (initial.mode === "basis" && expectedBasisVersion !== initial.version)
    throw new Error("Financial basis changed. Refresh before saving.");
  return { initial, principal };
}
function reason(value: string) {
  const result = value.trim();
  if (!result || result.length > 1000) throw new Error("Provide a financial change reason.");
  return result;
}
function same(a: unknown, b: unknown) {
  return financialBasisDigest(a) === financialBasisDigest(b);
}
function stableTeam(before: Team, after: Team) {
  if (
    before.id !== after.id ||
    !same(
      before.roster.map((p) => [p.id, p.teamId]),
      after.roster.map((p) => [p.id, p.teamId]),
    )
  )
    throw new Error("Financial membership and identities require explicit financial admission.");
}
async function appendHuman(
  tx: Sql,
  basis: FinancialBasis,
  inputs: FinancialInputs,
  principal: FinancialPrincipal,
  actorKind: "owner" | "guardian" | "coach",
  why: string,
) {
  const version = basis.version + 1;
  await tx`insert into financial_basis_versions(basis_id,version,payload,payload_digest,changed_by,reason,actor_kind) values(${ID},${version},${JSON.stringify(inputs)}::jsonb,${financialBasisDigest(inputs)},${principal.userId},${reason(why)},${actorKind})`;
  const rows =
    await tx`update financial_basis_state set current_version=${version},active_version=${version} where id=${ID} and activation_state='active' and current_version=${basis.version} and active_version=${basis.version} returning id`;
  if (rows.length !== 1) throw new Error("Financial basis changed. Refresh before saving.");
  return version;
}

export type FeePlanChange = {
  request: z.infer<typeof feeAction>;
  team: Team;
  plan: FeePlan;
  uniforms?: ClubRecord["uniforms"];
  expectedBasisVersion?: number;
  reason?: string;
};
export async function commitFinancialFeePlanInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: FeePlanChange,
): Promise<{ version: number | null; revision: number }> {
  const request = feeAction.parse(change.request);
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  const team = initial.basis
    ? "playerId" in request
      ? resolveFinancialAgreement(initial.basis, {
          teamId: request.teamId,
          playerId: request.playerId,
        }).team
      : resolveFinancialTeam(initial.basis, { teamId: request.teamId }).team
    : initial.club.teams.find((t) => t.id === request.teamId);
  if (!team) throw new Error("Financial team identity is unavailable.");
  stableTeam(team, change.team);
  const prior = initial.feePlans.find((r) => r.team_id === team.id);
  if ((prior?.revision || 0) !== request.revision || change.plan.revision !== request.revision + 1)
    throw new Error("This plan changed. Reload before saving.");
  if (!principal.owner) {
    const authoritative = { ...initial, principal };
    if (request.action === "accept") {
      if (!isFinancialGuardian(authoritative, request.teamId, request.playerId))
        throw new Error("Financial guardian access required.");
      const playerId = initial.basis
        ? resolveFinancialAgreement(initial.basis, {
            teamId: request.teamId,
            playerId: request.playerId,
          }).player.id
        : request.playerId;
      const restored = clone(change.team);
      for (const p of restored.roster) {
        const old = team.roster.find((r) => r.id === p.id)!;
        if (p.id === playerId) {
          for (const key of ["feeLock", "planLock", "depositPaid", "agreement"] as const) {
            if (Object.hasOwn(old, key)) Object.assign(p, { [key]: clone(old[key]) });
            else delete (p as unknown as Record<string, unknown>)[key];
          }
        }
      }
      if (initial.basis && !same(restored, team))
        throw new Error("Acceptance cannot change unrelated financial terms.");
      const restoredPlan = clone(change.plan);
      restoredPlan.revision = prior?.payload.revision ?? 0;
      restoredPlan.history = clone(prior?.payload.history || []);
      if (prior?.payload.players[playerId])
        restoredPlan.players[playerId] = clone(prior.payload.players[playerId]);
      else delete restoredPlan.players[playerId];
      if (initial.basis && (!prior || !same(restoredPlan, prior.payload)))
        throw new Error("Acceptance cannot change the published financial plan.");
    } else if (request.action === "propose") {
      if (!isFinancialCoach(authoritative, team) || !same(team, change.team))
        throw new Error("Financially assigned coach access required.");
      if (!prior) throw new Error("Ask an owner to establish the financial plan first.");
      const restored = clone(change.plan);
      restored.revision = prior.payload.revision;
      restored.history = clone(prior.payload.history);
      restored.status = prior.payload.status;
      restored.budget.tournament = prior.payload.budget.tournament;
      restored.budget.uniformId = prior.payload.budget.uniformId;
      restored.budget.uniformCost = prior.payload.budget.uniformCost;
      if (initial.basis && !same(restored, prior.payload))
        throw new Error("A coach proposal cannot change unrelated financial terms.");
    } else throw new Error("Admin financial owner access required.");
    if (change.uniforms && !same(change.uniforms, initial.club.uniforms))
      throw new Error("Admin financial owner access required.");
  }
  const nextClub = clone(initial.club);
  nextClub.teams = nextClub.teams.map((t) => (t.id === team.id ? clone(change.team) : t));
  if (change.uniforms) nextClub.uniforms = clone(change.uniforms);
  let version: number | null = null;
  if (initial.basis) {
    const inputs = clone(initial.basis.inputs);
    inputs.club = nextClub;
    const row = { team_id: team.id, revision: change.plan.revision, payload: clone(change.plan) };
    inputs.feePlans = prior
      ? inputs.feePlans.map((r) => (r.team_id === team.id ? row : r))
      : [...inputs.feePlans, row];
    version = await appendHuman(
      tx,
      initial.basis,
      inputs,
      principal,
      principal.owner ? "owner" : request.action === "accept" ? "guardian" : "coach",
      change.reason || "Team fee " + request.action,
    );
  } else if (
    ["publish", "roster", "playerRole", "accept", "lateFee"].includes(request.action) ||
    (request.action === "applyDefaults" && !same(nextClub, initial.club))
  ) {
    nextClub._rev = initial.club._rev + 1;
    nextClub._savedAt = new Date().toISOString();
    const changed =
      await tx`update club_state set payload=${JSON.stringify(nextClub)}::jsonb,rev=${nextClub._rev},updated_at=now() where id=${ID} and rev=${initial.club._rev} returning id`;
    if (changed.length !== 1) throw new Error("Club changed. Refresh before saving.");
  }
  await tx`insert into team_fee_plans(team_id,revision,payload) values(${team.id},${change.plan.revision},${JSON.stringify(change.plan)}::jsonb) on conflict(team_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=now()`;
  await tx`insert into club_audit(user_id,action,detail) values(${principal.userId},${"team-fee-" + request.action},${team.id})`;
  return { version, revision: change.plan.revision };
}

type VersionedChange<T> = { expectedRevision: number; value: T; expectedBasisVersion?: number };
export async function commitFinancialFeeBusinessInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: VersionedChange<FeeBusiness>,
) {
  const value = businessSchema.parse(change.value);
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  const prior = initial.feeBusiness.find((r) => r.id === "business");
  if ((prior?.revision || 0) !== change.expectedRevision)
    throw new Error("Business assumptions changed. Reload.");
  const revision = change.expectedRevision + 1;
  let version: number | null = null;
  if (initial.basis) {
    const inputs = clone(initial.basis.inputs),
      row = { id: "business", revision, payload: value };
    inputs.feeBusiness = prior
      ? inputs.feeBusiness.map((r) => (r.id === "business" ? row : r))
      : [...inputs.feeBusiness, row];
    version = await appendHuman(
      tx,
      initial.basis,
      inputs,
      principal,
      "owner",
      "Updated team fee business assumptions",
    );
  }
  await tx`insert into team_fee_business(id,revision,payload) values('business',${revision},${JSON.stringify(value)}::jsonb) on conflict(id) do update set revision=excluded.revision,payload=excluded.payload`;
  return { version, revision };
}
export async function commitFinancialBudgetMasterInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: VersionedChange<MasterMatrix>,
) {
  const value = masterSchema.parse(change.value);
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  const prior = initial.budgetMaster.find((r) => r.id === "master");
  if (!prior || prior.revision !== change.expectedRevision)
    throw new Error("The master changed. Reload before saving.");
  const revision = change.expectedRevision + 1;
  const [release] = await tx<{
    payload: unknown;
  }>`select payload from team_pricing_default_releases where version=1`;
  if (!release) throw Error("Team pricing defaults are unavailable.");
  const previousMaster = releasedMaster(
    normalizePOMaster(masterSchema.parse(withoutRetiredMembershipPricing(prior.payload))),
    release.payload,
  );
  // Classify legacy inheritance against the previous matrix, before an owner
  // changes a row. Save draft propagation and the master as one atomic revision.
  const nextPlans = initial.feePlans.map((row) => {
    const team = initial.club.teams.find((t) => t.id === row.team_id);
    if (!team || row.payload.status === "closed") return row;
    const plan = clone(row.payload);
    if (plan.published && !plan.publishedBudget) plan.publishedBudget = clone(plan.budget);
    plan.budget = linkedPricingDraft(plan, previousMaster, team);
    plan.budget = linkedPricingDraft(plan, value, team);
    if (same(plan, row.payload)) return row;
    plan.revision = row.revision + 1;
    plan.history = [
      ...plan.history,
      {
        at: new Date().toISOString(),
        actor: principal.name,
        action: `Master pricing revision ${revision}: inherited draft settings recalculated; published terms preserved.`,
      },
    ].slice(-500);
    return {
      ...row,
      revision: plan.revision,
      payload: JSON.parse(JSON.stringify(plan)) as FeePlan,
    };
  });
  let version: number | null = null;
  if (initial.basis) {
    const inputs = clone(initial.basis.inputs);
    inputs.feePlans = clone(nextPlans);
    inputs.budgetMaster = inputs.budgetMaster.map((r) =>
      r.id === "master" ? { id: "master", revision, payload: value } : r,
    );
    // Existing captured account bindings only. New financial personnel require
    // a separate reviewed owner admission command, not an operational account.
    if ((value.payroll || []).some((p) => !inputs.billing.accounts.some((a) => a.id === p.userId)))
      throw new Error("Financial payroll account admission is required.");
    version = await appendHuman(
      tx,
      initial.basis,
      inputs,
      principal,
      "owner",
      "Updated financial budget master",
    );
  }
  for (const row of nextPlans) {
    if (row.revision !== initial.feePlans.find((p) => p.team_id === row.team_id)!.revision)
      await tx`update team_fee_plans set payload=${JSON.stringify(row.payload)}::jsonb,revision=${row.revision} where team_id=${row.team_id}`;
  }
  await tx`update team_budget_master set payload=${JSON.stringify(value)}::jsonb,revision=${revision},updated_at=now() where id='master'`;
  await tx`insert into club_audit(user_id,action,detail) values(${principal.userId},'budget-master',${JSON.stringify({ before: prior.payload, after: value })})`;
  return { version, revision };
}

/** Provider-only read capability. This is not a way to initiate a payment or
 * authorize a customer. The original fulfillment path verifies the provider;
 * these checks bind the capability to the resulting authoritative DB ledger. */
export async function loadFinancialProviderContextInTransaction(
  tx: Sql,
  orderId: string,
): Promise<ProviderFinancialContext | null> {
  await lockFinancialExecution(tx);
  const { order } = await providerRows(tx, orderId);
  if (!order) return null;
  const source = await sourceInTransaction(tx);
  const context = { ...source, providerOrderId: order.id };
  issued.set(context, { tx, initial: clone(source), providerOrderId: order.id });
  return context;
}
async function providerRows(tx: Sql, orderId: string) {
  const [order] = await tx<
    import("../commerce/square-payments.server").SquareOrder
  >`select * from commerce_orders where id=${orderId} for update`;
  if (
    !order ||
    order.kind !== "team-fee" ||
    !order.snapshot.teamFee ||
    !order.square_payment_id ||
    !["production", "sandbox"].includes(order.payment_environment || "")
  )
    return { order: null, payment: null };
  const [payment] = await tx<
    import("../teams/financial-payment-adapter.server").LiveSquareTeamPayment
  >`select id,order_id,environment,status,amount_cents,refunded_cents,receipt_url from square_payments where id=${order.square_payment_id} for update`;
  if (!payment) return { order: null, payment: null };
  if (
    order.payment_provider !== "square" ||
    payment.order_id !== order.id ||
    payment.environment !== order.payment_environment ||
    payment.status !== "COMPLETED" ||
    payment.amount_cents !== order.total_cents
  )
    throw new Error("Verified Square ledger identity mismatch.");
  return { order, payment };
}
export async function reconcileFinancialTeamPaymentInTransaction(
  tx: Sql,
  orderId: string,
): Promise<{ mode: "legacy" | "basis" | null; changed: boolean; version: number | null }> {
  await lockFinancialExecution(tx);
  const { order, payment } = await providerRows(tx, orderId);
  if (!order || !payment || order.payment_environment !== "production")
    return { mode: null, changed: false, version: null };
  const source = await sourceInTransaction(tx);
  if (!source.basis) return { mode: "legacy", changed: false, version: null };
  const externalRows = await tx<{
    amount_cents: number;
  }>`select amount_cents from commerce_refunds where square_payment_id=${payment.id} and external_status='reconciled' for update`;
  const { transformFinancialTeamPaymentLedger } =
    await import("../teams/financial-payment-adapter.server");
  const transformed = transformFinancialTeamPaymentLedger(source.basis, {
    expectedVersion: source.basis.version,
    order,
    payment,
    externalReconciledCents: externalRows.reduce((sum, r) => sum + r.amount_cents, 0),
    now: new Date(),
  });
  if (!transformed.changed) return { mode: "basis", changed: false, version: source.version };
  const version = source.basis.version + 1;
  const observationDigest = financialBasisDigest(transformed.audit);
  await tx`insert into financial_basis_versions(basis_id,version,payload,payload_digest,changed_by,reason,actor_kind,provider_order_id,provider_payment_id,provider_environment,provider_observation_digest) values(${ID},${version},${JSON.stringify(transformed.nextInputs)}::jsonb,${financialBasisDigest(transformed.nextInputs)},null,'Verified Square payment/refund reconciliation','provider',${order.id},${payment.id},${payment.environment},${observationDigest})`;
  const rows =
    await tx`update financial_basis_state set current_version=${version},active_version=${version} where id=${ID} and activation_state='active' and current_version=${source.basis.version} and active_version=${source.basis.version} returning id`;
  if (rows.length !== 1) throw new Error("Financial basis changed. Reconcile again.");
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values('provider:square',${payment.id},'Square team payment reconciliation','Verified Square payment/refund and externally reconciled refund balance',${JSON.stringify(transformed.audit)}::jsonb)`;
  return { mode: "basis", changed: true, version };
}

/** Called only within an already-authorized session-completion transaction.
 * Does not authorize the operation or expose a financial projection to its user.
 * New lessons bind approved terms at creation; missing bindings fail closed. */
export type FinancialLessonContext =
  | { mode: "legacy" }
  | {
      mode: "basis";
      booking: FinancialInputs["compensation"]["bookings"][number] | null;
      compensation: FinancialInputs["compensation"];
      billing: FinancialInputs["billing"];
      version: number;
    };
export async function loadFinancialLessonsInTransaction(
  tx: Sql,
  bookingIds: string[],
  context?: FinancialReadContext,
): Promise<Map<string, FinancialLessonContext>> {
  await lockFinancialExecution(tx);
  if (!context && (await financialSourceModeInTransaction(tx)) === "legacy")
    return new Map(bookingIds.map((id) => [id, { mode: "legacy" as const }]));
  const source = context ? internal(tx, context).initial : await sourceInTransaction(tx);
  const result = new Map<string, FinancialLessonContext>();
  if (!source.basis) {
    for (const id of bookingIds) result.set(id, { mode: "legacy" });
    return result;
  }
  const bindings = await tx<{
    booking_id: string;
    basis_version: number;
    original_booking: FinancialInputs["compensation"]["bookings"][number];
  }>`select booking_id,basis_version,original_booking from financial_lesson_bindings where booking_id=any(${bookingIds}::text[])`;
  const versions = new Map<number, FinancialInputs>([[source.basis.version, source.basis.inputs]]);
  for (const version of new Set([1, ...bindings.map((b) => b.basis_version)])) {
    if (versions.has(version)) continue;
    const [row] = await tx<{
      payload: FinancialInputs;
      payload_digest: string;
    }>`select payload,payload_digest from financial_basis_versions where basis_id=${ID} and version=${version}`;
    if (!row || financialBasisDigest(row.payload) !== row.payload_digest)
      throw new Error("Original approved lesson terms are unavailable.");
    versions.set(version, row.payload);
  }
  // Share detached immutable attribution per version, not one whole snapshot
  // per historical booking. Caller-specific booking rows remain detached.
  const freeze = <T>(value: T): T => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const approvedCompensation = (inputs: FinancialInputs) => {
    const compensation = clone(inputs.compensation);
    for (const staff of compensation.staff) {
      const email = String(staff.email || "")
        .trim()
        .toLowerCase();
      if (staff.active !== true || !email) continue;
      const exists = compensation.development.some(
        (d) =>
          Array.isArray(d.coaches) &&
          d.coaches.some(
            (c) =>
              c &&
              typeof c === "object" &&
              !Array.isArray(c) &&
              String(c.email || "")
                .trim()
                .toLowerCase() === email,
          ),
      );
      if (exists) continue;
      const target = (compensation.development[0] ||= { coaches: [], coachPayouts: [] });
      if (!Array.isArray(target.coaches))
        throw new Error("Original approved instructor identities are unavailable.");
      target.coaches.push({
        id: newCoachId(email),
        name: staff.name || email,
        email,
        active: true,
      });
    }
    return freeze(compensation);
  };
  const attribution = new Map(
    [...versions].map(([version, inputs]) => [
      version,
      {
        compensation: approvedCompensation(inputs),
        billing: freeze(clone(inputs.billing)),
        bookings: new Map(inputs.compensation.bookings.map((b) => [b.id, b])),
      },
    ]),
  );
  const byId = new Map(bindings.map((b) => [b.booking_id, b]));
  for (const id of bookingIds) {
    const binding = byId.get(id),
      version = binding?.basis_version || 1;
    const terms = attribution.get(version)!;
    result.set(id, {
      mode: "basis",
      booking: clone(binding?.original_booking || terms.bookings.get(id) || null),
      compensation: terms.compensation,
      billing: terms.billing,
      version,
    });
  }
  return result;
}
export async function loadFinancialLessonInTransaction(
  tx: Sql,
  bookingId: string,
): Promise<FinancialLessonContext> {
  return (await loadFinancialLessonsInTransaction(tx, [bookingId])).get(bookingId)!;
}

/** Pre-charge admission validation, using exactly the same approved-terms
 * resolver as the original-booking INSERT trigger. This does not initiate or
 * authorize checkout, and must run within its already-authorized transaction. */
export type FinancialLessonAdmission = {
  basisVersion: number;
  coachId: string;
  productId: string;
  startsAt: string;
  endsAt: string;
};
export async function assertApprovedFinancialLessonInTransaction(
  tx: Sql,
  input: {
    coachId: string | null;
    productId: string;
    startsAt: string | Date;
    endsAt: string | Date;
    basisVersion?: number;
  },
): Promise<FinancialLessonAdmission | null> {
  await lockFinancialExecution(tx);
  if ((await financialSourceModeInTransaction(tx)) === "legacy") return null;
  const source = await sourceInTransaction(tx);
  if (!source.basis) throw new Error("Approved financial lesson source is unavailable.");
  const start = new Date(input.startsAt),
    end = new Date(input.endsAt);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start)
    throw new Error("A valid financial lesson duration is required.");
  if (!input.coachId) {
    const [service] =
      await tx`select id from club_services where id=${input.productId} and kind='lesson'`;
    if (!service) return null;
  }
  const version = input.basisVersion ?? source.basis.version;
  if (!Number.isSafeInteger(version) || version < 1 || version > source.basis.version)
    throw new Error("Approved financial lesson version is unavailable.");
  let inputs = source.basis.inputs;
  if (version !== source.basis.version) {
    const [row] = await tx<{
      payload: FinancialInputs;
      payload_digest: string;
    }>`select payload,payload_digest from financial_basis_versions where basis_id=${ID} and version=${version}`;
    if (!row || financialBasisDigest(row.payload) !== row.payload_digest)
      throw new Error("Approved financial lesson version is unavailable.");
    inputs = row.payload;
  }
  await tx`select approved_financial_lesson_terms(${JSON.stringify(inputs)}::jsonb,${input.coachId || ""},${input.productId},${end.toISOString()}::timestamptz)`;
  return {
    basisVersion: version,
    coachId: input.coachId || "",
    productId: input.productId,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

/** Owner command for financial payee identities and immutable dated rules only.
 * The caller updates finance_records and its existing audit in THIS transaction.
 * Never pass payables, bank rows, approvals or provider-ledger state here. */
export async function commitFinancialRecordsInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: {
    expectedBasisVersion?: number;
    records: import("./contracts").RecordRow[];
    reason: string;
  },
) {
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (
    change.records.some((r) => !["payee", "rule"].includes(r.kind)) ||
    new Set(change.records.map((r) => r.id)).size !== change.records.length
  )
    throw new Error("Only unique financial payee and rule records are supported.");
  if (!initial.basis) return { version: null };
  const previous = initial.basis.inputs.compensation.payeesAndRules;
  if (previous.some((r) => !change.records.some((n) => n.id === r.id && n.kind === r.kind)))
    throw new Error("Financial records cannot be removed or change kind.");
  for (const rule of previous.filter((r) => r.kind === "rule")) {
    if (
      !same(
        rule,
        change.records.find((r) => r.id === rule.id),
      )
    )
      throw new Error("Historical financial rules are immutable.");
  }
  const inputs = clone(initial.basis.inputs);
  // Preserve first-match tie ordering for existing identities/rules. New records
  // append in their reviewed order; updated records do not move to the end.
  inputs.compensation.payeesAndRules = [
    ...previous.map((r) => clone(change.records.find((n) => n.id === r.id)!)),
    ...change.records.filter((r) => !previous.some((p) => p.id === r.id)).map(clone),
  ];
  if (same(inputs, initial.basis.inputs)) return { version: initial.version };
  return {
    version: await appendHuman(tx, initial.basis, inputs, principal, "owner", change.reason),
  };
}

export async function recordFinancialTeamPaymentInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: {
    teamId: string;
    playerId: string;
    amount: number;
    method: string;
    label: string;
    expectedBasisVersion?: number;
  },
) {
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (
    !change.method.trim() ||
    change.method.length > 80 ||
    !change.label.trim() ||
    change.label.length > 200
  )
    throw new Error("A payment method and label are required.");
  const inputs = initial.basis ? clone(initial.basis.inputs) : null;
  const club = inputs?.club || clone(initial.club);
  const resolved = initial.basis ? resolveFinancialAgreement(initial.basis, change) : null;
  const teamId = resolved?.team.id || change.teamId,
    playerId = resolved?.player.id || change.playerId;
  const player = club.teams.find((t) => t.id === teamId)?.roster.find((p) => p.id === playerId);
  if (!player) throw new Error("Financial player agreement is unavailable.");
  const { assertRecordableTeamPayment, newRecordedTeamPaymentReceipt } =
    await import("../teams/recorded-payment-policy");
  assertRecordableTeamPayment(player, change.amount);
  if (change.method === "Square website")
    throw new Error("Square website entries require verified provider reconciliation.");
  const receipt = newRecordedTeamPaymentReceipt();
  player.payments.push({
    date: new Date().toISOString().slice(0, 10),
    amount: change.amount,
    fee: 0,
    charged: change.amount,
    method: change.method,
    label: change.label,
    receipt,
  });
  if (player.planLock?.dep !== undefined)
    player.depositPaid =
      Math.round(player.payments.reduce((sum, p) => sum + p.amount, 0) * 100) >=
      Math.round(player.planLock.dep * 100);
  let version: number | null = null;
  if (initial.basis && inputs) {
    version = await appendHuman(
      tx,
      initial.basis,
      inputs,
      principal,
      "owner",
      "Recorded manual team payment: " + change.label,
    );
  } else {
    club._rev = initial.club._rev + 1;
    club._savedAt = new Date().toISOString();
    club.audit.unshift({
      at: club._savedAt,
      action: "payment",
      detail: `${player.name} ${change.label} ${change.amount}`,
    });
    const changed =
      await tx`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=${club._rev},updated_at=now() where id=${ID} and rev=${initial.club._rev} returning id`;
    if (changed.length !== 1) throw new Error("Club changed. Refresh before saving.");
  }
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${principal.userId},${receipt},'Manual team payment','Owner recorded received funds',${JSON.stringify({ teamId, playerId, amount: change.amount, method: change.method, label: change.label })}::jsonb)`;
  return { version, receipt };
}

export type FinancialClubTermsChange = {
  expectedBasisVersion?: number;
  reason: string;
  settings?: Partial<ClubRecord["settings"]>;
  teams?: {
    teamId: string;
    terms?: Partial<
      Pick<
        Team,
        | "orgFee"
        | "coachMonthly"
        | "eventBudget"
        | "otherCosts"
        | "teamCageHoursPerWeek"
        | "playerCageHoursPerWeek"
        | "closed"
      >
    >;
    players?: { playerId: string; uniformWaived: boolean }[];
    staff?: { id: string; monthly: number; applyAmount: number; childId: string }[];
  }[];
};
/** Dedicated explicit owner financial form command. Never infer this command
 * from an operational whole-club save or allow unknown/passthrough fields. */
export async function commitFinancialClubTermsInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: FinancialClubTermsChange,
) {
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  const parsed = financialClubTermsChangeSchema.parse(change);
  const inputs = initial.basis ? clone(initial.basis.inputs) : null;
  const club = inputs?.club || clone(initial.club);
  if (parsed.settings) club.settings = { ...club.settings, ...parsed.settings };
  for (const edit of parsed.teams || []) {
    const id = initial.basis
      ? resolveFinancialTeam(initial.basis, { teamId: edit.teamId }).team.id
      : edit.teamId;
    const team = club.teams.find((t) => t.id === id);
    if (!team) throw new Error("Financial team identity is unavailable.");
    Object.assign(team, edit.terms);
    for (const entry of edit.players || []) {
      const playerId = initial.basis
        ? resolveFinancialAgreement(initial.basis, {
            teamId: edit.teamId,
            playerId: entry.playerId,
          }).player.id
        : entry.playerId;
      const player = team.roster.find((p) => p.id === playerId);
      if (!player) throw new Error("Financial player agreement is unavailable.");
      player.uniformWaived = entry.uniformWaived;
    }
    for (const entry of edit.staff || []) {
      const staff = team.staff.find((s) => s.id === entry.id);
      if (!staff || (entry.childId && !team.roster.some((p) => p.id === entry.childId)))
        throw new Error("Financial staff or child binding is unavailable.");
      Object.assign(staff, entry);
    }
  }
  if (same(club, initial.club)) return { version: initial.version };
  if (initial.basis && inputs)
    return {
      version: await appendHuman(tx, initial.basis, inputs, principal, "owner", parsed.reason),
    };
  club._rev = initial.club._rev + 1;
  club._savedAt = new Date().toISOString();
  const rows =
    await tx`update club_state set payload=${JSON.stringify(club)}::jsonb,rev=${club._rev},updated_at=now() where id=${ID} and rev=${initial.club._rev} returning id`;
  if (rows.length !== 1) throw new Error("Club changed. Refresh before saving.");
  return { version: null };
}

/** State only, for already-authorized operational commands. No financial data
 * or permission grant. An operational caller must still enforce its own scope. */
export async function financialSourceModeInTransaction(tx: Sql): Promise<"legacy" | "basis"> {
  await lockFinancialExecution(tx);
  const [state] = await tx<{
    activation_state: string;
    active_version: number | null;
    current_version: number;
  }>`select activation_state,active_version,current_version from financial_basis_state where id=${ID} for share`;
  if (!state || (state.activation_state === "captured" && state.active_version === null))
    return "legacy";
  if (
    state.activation_state === "active" &&
    Number.isSafeInteger(state.active_version) &&
    state.active_version! > 0 &&
    state.active_version === state.current_version
  )
    return "basis";
  throw new Error("Financial activation state is unavailable or inconsistent.");
}

type AdmissionSelection = { teamId: string; playerIds: string[]; sourceClubRevision: number };
type AdmissionAccount = {
  id: string;
  email: string;
  name: string;
  profileName: string | null;
  role: string | null;
};
async function admissionReview(tx: Sql, basis: FinancialBasis, request: AdmissionSelection) {
  // The review covers account/household sources independently of club revision.
  // Lock their insert/update paths while recomputing and recording the decision.
  await tx`lock table "user",profiles,club_households,household_members,person_guardian_links in share mode`;
  const [source] = await tx<{
    payload: ClubRecord;
    rev: number;
    demo: boolean;
  }>`select payload,rev,demo from club_state where id=${ID} for update`;
  if (!source || source.demo || source.rev !== request.sourceClubRevision)
    throw new Error("Operational source changed. Review financial admission again.");
  const candidates = source.payload.teams.filter((t) => t.id === request.teamId);
  if (candidates.length !== 1) throw new Error("Select an unambiguous operational team.");
  const candidate = candidates[0];
  const existingAlias = basis.teamAliases.find((a) => a.teamId === request.teamId);
  const existing = existingAlias ? resolveFinancialTeam(basis, { teamId: request.teamId }) : null;
  if (existing && !request.playerIds.length)
    throw new Error("This team already has financial setup. Select new players to admit.");
  if (new Set(request.playerIds).size !== request.playerIds.length)
    throw new Error("Choose each player once.");
  const selected = request.playerIds.map((id) => {
    const players = candidate.roster.filter((p) => p.id === id && p.teamId === candidate.id);
    if (
      players.length !== 1 ||
      source.payload.teams.flatMap((t) => t.roster).filter((p) => p.id === id).length !== 1
    )
      throw new Error("Select an unambiguous operational player.");
    if (
      basis.agreements.some((a) => a.originalPlayerId === id) ||
      basis.playerAliases.some((a) => a.playerId === id)
    )
      throw new Error(
        "This player already has a financial agreement. A transfer cannot create another obligation.",
      );
    const player = players[0];
    if (
      player.feeLock ||
      player.planLock ||
      player.agreement.signedAt ||
      player.payments.length ||
      player.credits.length
    )
      throw new Error("Review preexisting financial history separately before admission.");
    return clone(player);
  });
  const accounts = new Map<string, AdmissionAccount[]>();
  for (const player of selected) {
    const parentEmails = player.parents.map((p) => p.email.trim().toLowerCase()).filter(Boolean);
    accounts.set(
      player.id,
      await tx<AdmissionAccount>`select u.id,u.email,u.name,p.name as "profileName",p.role from "user" u left join profiles p on p.user_id=u.id where
      (coalesce(p.role,'parent')<>'player' and lower(trim(u.email))=any(${parentEmails}::text[]))
      or exists(select 1 from person_guardian_links g where g.user_id=u.id and g.household_id=${player.familyId})
      or (coalesce(p.role,'parent')<>'player' and exists(select 1 from household_members m where m.user_id=u.id and m.household_id=${player.familyId})) order by u.id`,
    );
  }
  const coachEmails = existing
    ? []
    : [candidate.coachEmail, ...candidate.staff.map((s) => s.email)]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
  const compensationAccounts =
    await tx<AdmissionAccount>`select u.id,u.email,u.name,p.name as "profileName",p.role from "user" u left join profiles p on p.user_id=u.id where lower(trim(u.email))=any(${coachEmails}::text[]) order by u.id`;
  for (const account of compensationAccounts) {
    const saved = basis.inputs.billing.accounts.find((a) => a.id === account.id);
    if (saved && saved.email.trim().toLowerCase() !== account.email.trim().toLowerCase())
      throw new Error(
        "Financial coach identity changed. Review that person's existing financial identity separately.",
      );
  }
  const reviewDigest = financialBasisDigest({
    compensationAccounts,
    basisVersion: basis.version,
    sourceClubRevision: source.rev,
    team: existing ? { id: candidate.id } : { ...candidate, roster: [] },
    players: selected.map((player) => ({ player, accounts: accounts.get(player.id)! })),
  });
  return { source, candidate, existing, selected, accounts, compensationAccounts, reviewDigest };
}
export type FinancialAdmissionPreview = {
  basisVersion: number;
  sourceClubRevision: number;
  reviewDigest: string;
  team: Pick<Team, "id" | "name" | "seasonLabel" | "headCoach" | "coachEmail" | "staff"> & {
    compensationAccounts: { userId: string; name: string; email: string }[];
    financialTerms: Pick<
      Team,
      | "sport"
      | "age"
      | "seasonStart"
      | "seasonEnd"
      | "seasons"
      | "months"
      | "uniformPackageId"
      | "uniformDeadline"
      | "orgFee"
      | "coachMonthly"
      | "eventBudget"
      | "otherCosts"
      | "teamCageHoursPerWeek"
      | "playerCageHoursPerWeek"
      | "closed"
    >;
  };
  players: {
    id: string;
    name: string;
    roleType: Team["roster"][number]["roleType"];
    joinedOn: string;
    withdrawn: boolean;
    uniformWaived: boolean;
    coachChild: boolean;
    cageOverage: number;
    planType: string;
    depositPaid: boolean;
    parentEmails: string[];
    guardians: { userId: string; name: string; email: string }[];
  }[];
};
export async function previewFinancialAdmissionInTransaction(
  tx: Sql,
  context: FinancialContext,
  request: AdmissionSelection,
): Promise<FinancialAdmissionPreview> {
  const { initial, principal } = await humanBaseline(tx, context, context.version || undefined);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (!initial.basis)
    throw new Error("Use the existing owner setup until financial cutover is active.");
  const review = await admissionReview(tx, initial.basis, request);
  const { candidate } = review;
  return {
    basisVersion: initial.basis.version,
    sourceClubRevision: review.source.rev,
    reviewDigest: review.reviewDigest,
    team: {
      id: candidate.id,
      name: candidate.name,
      seasonLabel: candidate.seasonLabel,
      headCoach: candidate.headCoach,
      coachEmail: candidate.coachEmail,
      staff: clone(candidate.staff),
      compensationAccounts: review.compensationAccounts.map((a) => ({
        userId: a.id,
        name: a.profileName || a.name,
        email: a.email,
      })),
      financialTerms: {
        sport: candidate.sport,
        age: candidate.age,
        seasonStart: candidate.seasonStart,
        seasonEnd: candidate.seasonEnd,
        seasons: clone(candidate.seasons || []),
        months: candidate.months,
        uniformPackageId: candidate.uniformPackageId,
        uniformDeadline: candidate.uniformDeadline,
        orgFee: candidate.orgFee,
        coachMonthly: candidate.coachMonthly,
        eventBudget: candidate.eventBudget,
        otherCosts: clone(candidate.otherCosts),
        teamCageHoursPerWeek: candidate.teamCageHoursPerWeek,
        playerCageHoursPerWeek: candidate.playerCageHoursPerWeek,
        closed: candidate.closed,
      },
    },
    players: review.selected.map((p) => ({
      id: p.id,
      name: p.name,
      roleType: p.roleType,
      joinedOn: p.joinedOn,
      withdrawn: p.withdrawn,
      uniformWaived: p.uniformWaived,
      coachChild: p.coachChild,
      cageOverage: p.cageOverage,
      planType: p.planType,
      depositPaid: p.depositPaid,
      parentEmails: p.parents.map((g) => g.email),
      guardians: review.accounts
        .get(p.id)!
        .map((a) => ({ userId: a.id, name: a.profileName || a.name, email: a.email })),
    })),
  };
}

/** Explicit owner-confirmed admission of NEW financial identities. Operational
 * creation alone never invokes this. Existing agreements/teams are not recopied. */
export async function admitFinancialEntitiesForOwnerInTransaction(
  tx: Sql,
  context: FinancialContext,
  raw: z.infer<typeof financialAdmissionSchema>,
): Promise<{
  version: number;
  teamSeasonId: string;
  agreements: { playerId: string; agreementId: string }[];
}> {
  const request = financialAdmissionSchema.parse(raw);
  const { initial, principal } = await humanBaseline(tx, context, request.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (!initial.basis)
    throw new Error("Use the existing owner setup until financial cutover is active.");
  const basis = initial.basis;
  const { source, candidate, existing, selected, accounts, compensationAccounts, reviewDigest } =
    await admissionReview(tx, basis, request);
  if (request.reviewDigest !== reviewDigest)
    throw new Error("Financial admission identities changed. Review the people and terms again.");
  const inputs = clone(basis.inputs);
  const teamSeasonId = existing?.identity.id || randomUUID();
  const agreements = selected.map((p) => ({ playerId: p.id, agreementId: randomUUID() }));
  if (existing) {
    const target = inputs.club.teams.find((t) => t.id === existing.team.id)!;
    for (const p of selected) target.roster.push({ ...p, teamId: target.id });
  } else {
    if (inputs.club.teams.some((t) => t.id === candidate.id))
      throw new Error("Financial team identity is inconsistent.");
    inputs.club.teams.push({
      ...clone(candidate),
      roster: selected,
      tournamentIds: [],
      practices: [],
    });
  }
  // Explicit, scoped guardian attribution for the newly admitted agreements.
  // New accounts cannot gain old agreements by matching a historical email.
  inputs.billing.agreementGuardians ||= [];
  for (const selectedPlayer of selected) {
    const agreementId = agreements.find((a) => a.playerId === selectedPlayer.id)!.agreementId;
    for (const account of accounts.get(selectedPlayer.id)!) {
      const saved = inputs.billing.accounts.find((a) => a.id === account.id);
      if (!saved) inputs.billing.accounts.push({ ...account, admittedAgreementIds: [agreementId] });
      else if (saved.admittedAgreementIds) saved.admittedAgreementIds.push(agreementId);
      inputs.billing.agreementGuardians.push({
        agreementId,
        userId: account.id,
        householdId: selectedPlayer.familyId,
      });
    }
  }
  for (const account of compensationAccounts) {
    const saved = inputs.billing.accounts.find((a) => a.id === account.id);
    if (!saved)
      inputs.billing.accounts.push({
        ...account,
        admittedAgreementIds: [],
        admittedTeamIds: [candidate.id],
      });
    else if (saved.admittedAgreementIds || saved.admittedTeamIds) {
      saved.admittedTeamIds ||= [];
      if (!saved.admittedTeamIds.includes(candidate.id)) saved.admittedTeamIds.push(candidate.id);
    }
  }
  const version = await appendHuman(tx, basis, inputs, principal, "owner", request.reason);
  if (!existing) {
    await tx`insert into financial_team_seasons(id,basis_id,original_team_id,created_version) values(${teamSeasonId},${ID},${candidate.id},${version})`;
    await tx`insert into financial_team_aliases(basis_id,legacy_team_id,team_season_id,created_version) values(${ID},${candidate.id},${teamSeasonId},${version})`;
  }
  for (const entry of agreements) {
    await tx`insert into financial_player_agreements(id,basis_id,team_season_id,original_player_id,created_version) values(${entry.agreementId},${ID},${teamSeasonId},${entry.playerId},${version})`;
    await tx`insert into financial_player_aliases(basis_id,legacy_team_id,legacy_player_id,agreement_id,created_version) values(${ID},${candidate.id},${entry.playerId},${entry.agreementId},${version})`;
  }
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${principal.userId},${teamSeasonId},'Financial identity admission',${request.reason},${JSON.stringify({ teamId: candidate.id, teamSeasonId, agreements, sourceClubRevision: source.rev, version })}::jsonb)`;
  return { version, teamSeasonId, agreements };
}

function validateFinancialActivity(value: TeamActivity): TeamActivity {
  const keys = new Set([
    "teamId",
    "id",
    "revision",
    "kind",
    "entryFee",
    "travel",
    "overnightNights",
    "season",
    "title",
    "date",
    "startTime",
    "endTime",
    "location",
    "status",
    "ourRuns",
    "oppRuns",
    "stats",
  ]);
  const parsed = activityInput.parse(
    Object.fromEntries(Object.entries(value).filter(([key]) => keys.has(key))),
  );
  // Validate known fields without dropping unknown persisted historical fields.
  return { ...value, ...parsed };
}
export type FinancialActivityValue = {
  date: string;
  status: TeamActivity["status"];
  entryFee: number;
  travel: NonNullable<TeamActivity["travel"]>;
  overnightNights: number;
};
const activityFinancialFields = (value: FinancialActivityValue) => ({
  date: value.date,
  status: value.status,
  entryFee: value.entryFee,
  travel: value.travel,
  overnightNights: value.overnightNights,
});
type FinancialActivityChange = {
  expectedBasisVersion: number;
  teamId: string;
  activityId: string;
  value: FinancialActivityValue;
  reason: string;
};
async function saveFinancialActivity(
  tx: Sql,
  initial: FinancialReadContext,
  principal: FinancialPrincipal,
  team: Team,
  next: TeamActivity,
  prior: TeamActivity | null,
  why: string,
) {
  const basis = initial.basis!;
  const inputs = clone(basis.inputs);
  const target = inputs.club.teams.find((t) => t.id === team.id)!;
  const oldIndex = inputs.activities.findIndex((a) => a.id === next.id);
  const nextRow = { id: next.id, team_id: team.id, revision: next.revision, payload: next };
  if (oldIndex < 0) inputs.activities.push(nextRow);
  else inputs.activities[oldIndex] = nextRow;
  if (next.kind === "tournament") {
    const catalog = inputs.club.catalog.find((e) => e.id === next.id);
    if (catalog) {
      catalog.start = next.date;
      catalog.end = next.date;
    } else
      inputs.club.catalog.push({
        id: next.id,
        name: next.title,
        sport: target.sport,
        ages: [target.age],
        start: next.date,
        end: next.date,
        city: next.location,
        state: "",
        org: "Team schedule",
        fee: 0,
        stayToPlay: false,
        levels: [],
        type: "tournament",
        verifiedOn: next.date,
      });
    target.tournamentIds = target.tournamentIds.filter((id) => id !== next.id);
    if (next.status !== "cancelled") target.tournamentIds.push(next.id);
  }
  const fee = inputs.feePlans.find((f) => f.team_id === team.id);
  if (fee && fee.payload.status !== "closed") {
    const plan = fee.payload;
    const events = inputs.activities.filter((a) => a.team_id === team.id).map((a) => a.payload);
    const budget = {
      ...plan.budget,
      hotelNightly: plan.budget.hotelNightly || 0,
      hotelNights: seasonHotelNights(events, plan.budget),
      tournament: plan.budget.scheduleCostsAutomatic
        ? seasonEntryCosts(events, plan.budget, inputs.club.catalog, target.tournamentIds)
        : plan.budget.tournament,
    };
    if (
      budget.hotelNights !== (plan.budget.hotelNights || 0) ||
      budget.tournament !== plan.budget.tournament ||
      (plan.defaults &&
        (!prior ||
          (["date", "travel", "overnightNights", "entryFee"] as const).some(
            (k) => prior[k] !== next[k],
          ) ||
          (prior.status === "cancelled") !== (next.status === "cancelled")))
    ) {
      plan.budget = budget;
      if (plan.budget.readiness)
        plan.budget.readiness = { ...plan.budget.readiness, schedule: false, hotels: false };
      plan.revision = fee.revision + 1;
      fee.revision = plan.revision;
      plan.status = "pending";
      plan.history.push({
        at: new Date().toISOString(),
        actor: principal.userId,
        action: "Schedule costs updated; review revised player fees.",
      });
      // Published budgets and accepted player locks remain exactly as saved.
      await tx`insert into team_fee_plans(team_id,payload,revision) values(${team.id},${JSON.stringify(plan)}::jsonb,${plan.revision}) on conflict(team_id) do update set payload=excluded.payload,revision=excluded.revision,updated_at=now()`;
    }
  }
  const version = await appendHuman(tx, basis, inputs, principal, "owner", why);
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${principal.userId},${next.id},${prior ? "Financial event amendment" : "Financial event admission"},${why},${JSON.stringify({ teamId: team.id, activityId: next.id, revision: next.revision, version })}::jsonb)`;
  return { version, revision: next.revision };
}
export async function commitFinancialActivityInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: FinancialActivityChange & { expectedRevision: number },
): Promise<{ version: number; revision: number }> {
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (!initial.basis) throw new Error("Financial event commands require active financial context.");
  const { team } = resolveFinancialTeam(initial.basis, { teamId: change.teamId });
  const prior = initial.activities.find((a) => a.id === change.activityId && a.team_id === team.id);
  if (!prior || prior.revision !== change.expectedRevision)
    throw new Error("Financial event changed. Refresh before saving.");
  if (
    prior.payload.id !== prior.id ||
    prior.payload.teamId !== team.id ||
    prior.payload.kind === "practice"
  )
    throw new Error("Financial event identity is inconsistent or unsupported.");
  const value = validateFinancialActivity({
    ...prior.payload,
    ...activityFinancialFields(change.value),
    id: prior.id,
    teamId: team.id,
    revision: prior.revision + 1,
  });
  return saveFinancialActivity(
    tx,
    initial,
    principal,
    team,
    value,
    prior.payload,
    reason(change.reason),
  );
}
export async function admitFinancialActivityForOwnerInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: FinancialActivityChange & { expectedSourceRevision: number; confirmed: true },
): Promise<{ version: number; revision: number }> {
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (!initial.basis || change.confirmed !== true)
    throw new Error("Confirm explicit financial event admission.");
  const { team } = resolveFinancialTeam(initial.basis, { teamId: change.teamId });
  if (initial.activities.some((a) => a.id === change.activityId))
    throw new Error(
      "This event already has a financial commitment. Amend its saved terms instead.",
    );
  const [source] = await tx<{
    team_id: string;
    revision: number;
    payload: TeamActivity;
  }>`select team_id,revision,payload from team_activities where id=${change.activityId} for update`;
  if (
    !source ||
    source.team_id !== change.teamId ||
    source.revision !== change.expectedSourceRevision
  )
    throw new Error("Operational event changed. Review its financial admission again.");
  if (
    source.payload.id !== change.activityId ||
    source.payload.teamId !== source.team_id ||
    source.payload.kind === "practice"
  )
    throw new Error("Operational event identity is inconsistent or unsupported.");
  const value = validateFinancialActivity({
    ...source.payload,
    ...activityFinancialFields(change.value),
    id: change.activityId,
    teamId: team.id,
    revision: 1,
  });
  return saveFinancialActivity(tx, initial, principal, team, value, null, reason(change.reason));
}

/** Owner price confirmation preserves frozen metadata. The public compatibility
 * mirror changes one selected fee field only under the same source revision. */
export async function commitFinancialCatalogPriceInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: {
    expectedBasisVersion: number;
    sourceClubRevision: number;
    catalogId: string;
    fee: number;
    confirmed: true;
    reason: string;
  },
): Promise<{ version: number; sourceClubRevision: number }> {
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (!initial.basis || change.confirmed !== true)
    throw new Error("Confirm explicit financial catalog pricing.");
  if (!Number.isFinite(change.fee) || change.fee < 0 || change.fee > 1_000_000_000)
    throw new Error("Provide a valid catalog entry fee.");
  const why = reason(change.reason);
  const [source] = await tx<{
    payload: ClubRecord;
    rev: number;
    demo: boolean;
  }>`select payload,rev,demo from club_state where id=${ID} for update`;
  if (!source || source.demo || source.rev !== change.sourceClubRevision)
    throw new Error("Operational catalog changed. Review the price again.");
  const inputs = clone(initial.basis.inputs),
    saved = inputs.club.catalog.filter((e) => e.id === change.catalogId),
    live = source.payload.catalog.filter((e) => e.id === change.catalogId);
  if (saved.length > 1 || live.length > 1 || (!saved.length && live.length !== 1))
    throw new Error("Select an unambiguous catalog event.");
  if (saved.length) saved[0].fee = change.fee;
  else inputs.club.catalog.push({ ...clone(live[0]), fee: change.fee });
  const version = await appendHuman(tx, initial.basis, inputs, principal, "owner", why);
  let sourceClubRevision = source.rev;
  if (live.length) {
    live[0].fee = change.fee;
    sourceClubRevision++;
    source.payload._rev = sourceClubRevision;
    source.payload._savedAt = new Date().toISOString();
    await tx`update club_state set payload=${JSON.stringify(source.payload)}::jsonb,rev=${sourceClubRevision},updated_at=now() where id=${ID}`;
  }
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${principal.userId},${change.catalogId},'Financial catalog price',${why},${JSON.stringify({ fee: change.fee, version, sourceClubRevision })}::jsonb)`;
  return { version, sourceClubRevision };
}

/** Apply exactly one already-authorized owner service/staff edit to FUTURE
 * approved compensation terms. Caller wrote the target in this transaction.
 * Original bookings and precharge pins keep their prior immutable version. */
export async function commitFinancialLessonTermsInTransaction(
  tx: Sql,
  context: FinancialContext,
  change: {
    expectedBasisVersion?: number;
    command:
      { type: "service"; serviceId: string } | { type: "staff"; staffId: string; coachId?: string };
    reason: string;
  },
): Promise<{ version: number | null }> {
  const { initial, principal } = await humanBaseline(tx, context, change.expectedBasisVersion);
  if (!principal.owner) throw new Error("Admin financial owner access required.");
  if (!initial.basis) return { version: null };
  const inputs = clone(initial.basis.inputs),
    terms = inputs.compensation,
    command = change.command;
  const why = reason(change.reason);
  type Row = FinancialInputs["compensation"]["staff"][number];
  const replace = (rows: Row[], id: string, value: Row | undefined) => {
    const index = rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      if (value) rows[index] = value;
      else rows.splice(index, 1);
    } else if (value) rows.push(value);
  };
  if (command.type === "service") {
    if (!command.serviceId.trim()) throw new Error("Select the approved service.");
    const [row] = await tx<{
      value: Row;
    }>`select to_jsonb(s) as value from club_services s where id=${command.serviceId} for update`;
    // The complete approved service inventory was captured at initialization.
    // Old captured drafts without that inventory require reviewed recapture.
    if (!terms.services)
      throw new Error("Approved service inventory requires reviewed financial initialization.");
    replace(terms.services, command.serviceId, row?.value);
    if (!row)
      terms.staffServices = terms.staffServices.filter((r) => r.service_id !== command.serviceId);
  } else if (command.type === "staff") {
    if (!command.staffId.trim()) throw new Error("Select the approved staff identity.");
    const prior = terms.staff.find((r) => r.id === command.staffId);
    const [row] = await tx<{
      value: Row;
    }>`select to_jsonb(s) as value from club_staff s where id=${command.staffId} for update`;
    replace(terms.staff, command.staffId, row?.value);
    const offers = await tx<{
      value: Row;
    }>`select to_jsonb(s) as value from club_staff_services s where staff_id=${command.staffId} order by service_id for update`;
    terms.staffServices = terms.staffServices.filter((r) => r.staff_id !== command.staffId);
    terms.staffServices.push(...offers.map((r) => r.value));
    const email = String(row?.value.email || prior?.email || "")
      .trim()
      .toLowerCase();
    const [development] = await tx<{
      payload: { coaches?: Row[]; coachPayouts?: Row[] };
    }>`select payload::jsonb from pd_working_file where id='club' for update`;
    const coaches = Array.isArray(development?.payload.coaches) ? development.payload.coaches : [];
    const matching = coaches.filter((c) =>
      command.coachId
        ? c.id === command.coachId
        : String(c.email || "")
            .trim()
            .toLowerCase() === email,
    );
    if (command.coachId && matching.length !== 1)
      throw new Error("Select an unambiguous approved instructor identity.");
    if (matching.length > 1)
      throw new Error("Multiple instructor identities require explicit financial review.");
    const coach =
      matching[0] ||
      (row && email
        ? { id: newCoachId(email), name: row.value.name, email, active: row.value.active }
        : undefined);
    const target = (terms.development[0] ||= { coaches: [], coachPayouts: [] });
    if (!Array.isArray(target.coaches) || !Array.isArray(target.coachPayouts))
      throw new Error("Approved instructor terms are unavailable.");
    if (coach) {
      const savedCoach = {
        ...coach,
        ...(!row || row.value.active === false ? { active: false } : {}),
      };
      replace(target.coaches as Row[], String(coach.id), savedCoach);
      const payouts = Array.isArray(development?.payload.coachPayouts)
        ? development.payload.coachPayouts.filter((p) => p.coachId === coach.id)
        : [];
      target.coachPayouts = (target.coachPayouts as Row[])
        .filter((p) => p.coachId !== coach.id)
        .concat(payouts);
    } else if (!row || row.value.active === false) {
      for (const saved of target.coaches as Row[])
        if (
          String(saved.email || "")
            .trim()
            .toLowerCase() === email
        )
          saved.active = false;
    }
  } else throw new Error("Unsupported approved compensation command.");
  if (same(terms, initial.basis.inputs.compensation)) return { version: initial.version };
  const version = await appendHuman(tx, initial.basis, inputs, principal, "owner", why);
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${principal.userId},${command.type === "service" ? command.serviceId : command.staffId},'Approved future lesson terms',${why},${JSON.stringify({ command, version })}::jsonb)`;
  return { version };
}

/** Purpose-specific owner admission; no arbitrary snapshot writer is exported. */
export async function previewFinancialSelfAdmissionInTransaction(
  tx: Sql,
  context: FinancialContext,
  raw: unknown,
) {
  const { financialSelfAdmissionSelection } = await import("./context-contracts");
  const selection = financialSelfAdmissionSelection.parse(raw);
  const { initial, principal } = await humanBaseline(tx, context, context.version || undefined);
  if (!principal.owner) throw Error("Admin financial owner access required.");
  if (!initial.basis)
    throw Error("Explicit financial identity admission is available after financial cutover.");
  const current = await financialPrincipalInTransaction(tx, selection.userId);
  const [account] = await tx<{
    id: string;
    email: string;
    name: string;
    profileName: string;
    role: string;
  }>`select u.id,lower(trim(u.email)) as email,u.name,p.name as "profileName",p.role from "user" u left join profiles p on p.user_id=u.id where u.id=${selection.userId} for share of u`;
  if (!account || current.currentEmail !== account.email)
    throw Error("The verified target account changed.");
  const inputs = initial.basis.inputs;
  const payee = inputs.compensation.payeesAndRules.find(
    (r) => r.kind === "payee" && r.id === selection.payeeId,
  );
  let payload = payee?.payload as Record<string, unknown> | undefined;
  if (!payload) {
    const { personId } = await import("./sources.server");
    const configured = inputs.compensation.payeesAndRules.some(
      (r) =>
        r.kind === "payee" &&
        String((r.payload as Record<string, unknown>).email || "")
          .trim()
          .toLowerCase() === current.currentEmail,
    );
    if (!configured && selection.payeeId === personId(current.currentEmail))
      payload = {
        id: selection.payeeId,
        name: account.profileName || account.name,
        email: current.currentEmail,
        active: true,
      };
  }
  if (!payload || payload.active === false)
    throw Error("Choose an approved active financial payee.");
  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  if (!email || email !== current.currentEmail)
    throw Error("Review the exact account and approved payee identity.");
  let coach: { id: string; email: string; name: string } | null = null;
  const bookings: Record<string, unknown>[] = [],
    orders: Record<string, unknown>[] = [];
  if (selection.kind === "instructor") {
    for (const development of inputs.compensation.development) {
      if (Array.isArray(development.coaches))
        for (const c of development.coaches) {
          if (
            c &&
            typeof c === "object" &&
            !Array.isArray(c) &&
            c.id === selection.coachId &&
            c.active !== false
          )
            coach = {
              id: String(c.id),
              email: String(c.email || "")
                .trim()
                .toLowerCase(),
              name: String(c.name || ""),
            };
        }
    }
    if (!coach) {
      const staff = inputs.compensation.staff.find(
        (s) =>
          s.active === true &&
          newCoachId(
            String(s.email || "")
              .trim()
              .toLowerCase(),
          ) === selection.coachId,
      );
      if (staff)
        coach = {
          id: selection.coachId,
          email: String(staff.email || "")
            .trim()
            .toLowerCase(),
          name: String(staff.name || ""),
        };
    }
    if (!coach || coach.email !== email)
      throw Error("Choose the approved instructor and matching financial payee.");
    const contexts = await loadFinancialLessonsInTransaction(tx, selection.bookingIds, context);
    for (const id of selection.bookingIds) {
      const lesson = contexts.get(id)!;
      if (lesson.mode !== "basis" || !lesson.booking)
        throw Error("A selected lesson has no immutable financial attribution.");
      const earning = lesson.compensation.earnings.find((e) => e.booking_id === id);
      if (String(earning?.coach_id || lesson.booking.coach_id || "") !== coach.id)
        throw Error("A selected lesson belongs to a different financial instructor.");
      bookings.push({
        id,
        version: lesson.version,
        booking: lesson.booking,
        earning: earning || null,
      });
    }
    for (const id of selection.orderIds) {
      const [order] = await tx<{
        id: string;
        status: string;
        snapshot: Record<string, unknown>;
      }>`select id,status,snapshot from commerce_orders where id=${id} for share`;
      const pin = order?.snapshot.financialLessonAdmission as FinancialLessonAdmission | undefined;
      if (
        !order ||
        !["pending", "payment_review", "paid"].includes(order.status) ||
        !pin ||
        pin.coachId !== coach.id
      )
        throw Error("A selected pending order lacks the original approved instructor pin.");
      if ((await tx`select id from booking_records where order_id=${id}`).length)
        throw Error("Select the existing lesson instead of its fulfilled order.");
      orders.push(order);
    }
  }
  const review = {
    selection,
    account,
    payee: payload,
    coach,
    bookings,
    orders,
    basisVersion: initial.basis.version,
  };
  return { ...review, reviewDigest: financialBasisDigest(review) };
}
export async function admitFinancialSelfIdentityInTransaction(
  tx: Sql,
  context: FinancialContext,
  raw: unknown,
) {
  const { financialSelfAdmissionCommand } = await import("./context-contracts");
  const request = financialSelfAdmissionCommand.parse(raw);
  const { initial, principal } = await humanBaseline(tx, context, request.expectedBasisVersion);
  if (!principal.owner || !initial.basis)
    throw Error("Admin financial owner access and active financial basis required.");
  const review = await previewFinancialSelfAdmissionInTransaction(tx, context, request.selection);
  if (review.reviewDigest !== request.reviewDigest)
    throw Error(
      "Financial identity review changed. Review the account and original selections again.",
    );
  const inputs = clone(initial.basis.inputs),
    version = initial.basis.version + 1;
  if (!inputs.billing.accounts.some((a) => a.id === review.account.id))
    inputs.billing.accounts.push({
      ...review.account,
      admittedAgreementIds: [],
      admittedTeamIds: [],
    });
  const id = randomUUID();
  if (request.selection.kind === "instructor") {
    inputs.billing.instructorAccess ||= [];
    if (
      inputs.billing.instructorAccess.some(
        (a) => a.userId === review.account.id && a.coachId === request.selection.coachId,
      )
    )
      throw Error("This financial instructor identity is already admitted.");
    inputs.billing.instructorAccess.push({
      id,
      userId: review.account.id,
      coachId: request.selection.coachId,
      payeeId: request.selection.payeeId,
      fromVersion: version,
      bookingIds: [...request.selection.bookingIds],
      orderIds: [...request.selection.orderIds],
    });
  } else {
    inputs.billing.payrollAccess ||= [];
    if (inputs.billing.payrollAccess.some((a) => a.userId === review.account.id))
      throw Error("This payroll identity is already admitted.");
    inputs.billing.payrollAccess.push({
      id,
      userId: review.account.id,
      payeeId: request.selection.payeeId,
      fromMonth: request.selection.fromMonth!,
    });
  }
  await appendHuman(tx, initial.basis, inputs, principal, "owner", request.reason);
  await tx`insert into finance_audit(actor_id,record_id,action,reason,after_state) values(${principal.userId},${id},'Financial self identity admission',${request.reason},${JSON.stringify({ selection: request.selection, version, reviewDigest: review.reviewDigest })}::jsonb)`;
  return { id, version };
}
