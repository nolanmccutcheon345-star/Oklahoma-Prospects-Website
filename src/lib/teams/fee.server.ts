import { auditFeeExplanation } from "./fee-explanation.server";
import { requireFeeExplanation } from "./fee-explanation";
import { isIndependent, independentInstallmentLabel } from "./independent-model";
import { mutateIndependentProspects } from "./independent-prospects.server";
import { teamCollectionsEnabled } from "./collections.server";
import { pinSpendingBudget, teamExpenseTotals, teamBudgetLedger } from "../finance/team-budget";
import {
  installmentRemaining,
  installmentLateFee,
  type CollectionTerms,
} from "./collection-policy";
import { currentMembershipOffer, withoutRetiredMembershipPricing } from "./retired-membership";
import { linkedPricingDraft, pricingRevisionNeeded } from "./pricing-defaults";
import { poRosterLimit } from "./po-roster";
import { assertRosterAssignment, assertRosterCapacity } from "./po-roster.server";
import { linkedPODraft } from "./budget-matrix";
import { publicationHealth, offersPO, pendingGas, publicationCostIssues } from "./fee-health";
import { teamSeasonOverhead } from "./facility-overhead";
import { loadBudgetMaster } from "./budget-matrix.server";
import { budgetFromMatrix, rowKey } from "./budget-matrix";
import { seasonHotelNights, seasonEntryCosts, withScheduledHotels } from "./travel-budget";
import type { Sql } from "../db";
import {
  withFinancialContext,
  financialReadSnapshotInTransaction,
  type FinancialContext,
  commitFinancialFeePlanInTransaction,
  commitFinancialFeeBusinessInTransaction,
  commitFinancialActivityInTransaction,
  admitFinancialActivityForOwnerInTransaction,
  isFinancialGuardian,
  isFinancialCoach,
} from "../finance/context.server";
import { resolveFinancialTeam, resolveFinancialAgreement } from "../finance/basis.server";
import type { FinancialPrincipal } from "../finance/principal.server";
import { day, type RecordRow } from "../finance/contracts";
import { publicationOffer } from "./fee-publication";
import type { TeamActivity } from "./activity-contracts";
import type { Team, Player } from "./types";
import {
  feeAction,
  businessSchema,
  financialEventAmendment,
  financialEventAdmission,
  type FeePlan,
  type FeeBusiness,
} from "./fee-contracts";
import {
  type FeeBudget,
  budgetSchema,
  budgetForRoster,
  defaultBudget,
  calculateFees,
  withBillableMonths,
  additionalPlayerContribution,
  project,
  deadline,
  scheduleRows,
  pastDueReviewed,
  organizationDay,
  paymentStatus,
  membershipRecognition,
  sum,
} from "./fee-model";
import type { z } from "zod";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const norm = (s: string) => s.trim().toLowerCase();
type Identity = FinancialPrincipal;
function guardian(p: Player, me: Identity) {
  return (
    (me.role !== "player" && p.parents.some((g) => norm(g.email) === me.email)) ||
    (me.role === "player" ? me.guardianHouseholdIds : me.familyIds).includes(p.familyId)
  );
}
function initial(t: Team): FeePlan {
  return {
    budget: withBillableMonths({
      ...defaultBudget(),
      pricingInheritance: { version: 1, overrides: [] },
      start: t.seasonStart,
      end: t.seasonEnd,
      months: t.months || 3,
    }),
    uniforms: [],
    status: "draft",
    revision: 0,
    expenses: [],
    players: {},
    history: [],
  };
}
function paymentEvents(context: FinancialContext, team: Team, b: FeeBudget) {
  const catalog = context.club.catalog.filter((e) => team.tournamentIds.includes(e.id));
  if (!b.eventPaymentSchedule)
    return catalog.map((e) => ({ id: e.id, name: e.name, start: e.start }));
  const activities = context.activities
    .filter((a) => a.team_id === team.id && a.payload.status !== "cancelled")
    .map((a) => ({ id: a.id, name: a.payload.title || "Team event", start: a.payload.date }));
  // Canceled scheduled events cannot re-enter through their catalog mirror.
  const canceled = new Set(
    context.activities
      .filter((a) => a.team_id === team.id && a.payload.status === "cancelled")
      .map((a) => a.id),
  );
  return [...catalog.filter((e) => e.org !== "Team schedule" && !canceled.has(e.id)), ...activities]
    .map((e) => ({ id: e.id, name: e.name, start: organizationDay(e.start) }))
    .filter((e) => e.start && e.start >= b.start && e.start <= b.end);
}
function checkBudget(p: FeePlan) {
  const b = withBillableMonths(budgetSchema.parse(withoutRetiredMembershipPricing(p.budget)));
  if (!b.start || !b.end || b.end < b.start) throw Error("Set a valid season date range.");
  if (b.holdDays <= b.graceDays || b.removalDays < b.holdDays)
    throw Error("Roster hold must follow the grace period; removal must follow hold.");
  if (
    new Set(b.costs.map((c) => c.id)).size !== b.costs.length ||
    new Set(p.uniforms.map((u) => u.id)).size !== p.uniforms.length ||
    new Set(p.expenses.map((e) => e.id)).size !== p.expenses.length
  )
    throw Error("Duplicate record identifiers.");
  const uniform = p.uniforms.find((u) => u.id === b.uniformId && u.active);
  if (b.uniformId && !uniform) throw Error("Select an active uniform package.");
  b.uniformCost = uniform?.cost || 0;
  p.budget = b;
  return p;
}
function paid(p: Player) {
  return Math.round(sum((p.payments || []).map((x) => x.amount)) * 100);
}
function credit(p: Player) {
  return Math.round(sum((p.credits || []).map((x) => x.amount)) * 100);
}
export function playerView(t: Team, p: Player, plan: FeePlan, asOf = today()) {
  const offer =
    p.roleType === "po" && !p.feeLock && !offersPO(plan.budget, t.sport)
      ? undefined
      : plan.published
        ? currentMembershipOffer(plan.published)
        : undefined;
  const total = p.feeLock
    ? Math.round(p.feeLock.amount * 100)
    : offer
      ? p.roleType === "po"
        ? offer.po
        : offer.full
      : 0;
  const terms = plan.players[p.id]?.latePolicy;
  const policy = terms
    ? {
        ...plan.budget,
        graceDays: terms.grace,
        holdDays: terms.hold,
        removalDays: terms.removal,
        lateFee: terms.fee,
      }
    : plan.budget;
  const agreedBudget = plan.publishedBudget || plan.budget;
  const previewSchedule =
    offer &&
    !p.feeLock &&
    !agreedBudget.paymentSchedule &&
    !agreedBudget.secondDue &&
    asOf <= offer.finalDue
      ? scheduleRows(agreedBudget, total, p.roleType === "po" ? "po" : "full", offer.finalDue, asOf)
      : offer?.schedules?.[p.roleType === "po" ? "po" : "full"];
  const rows = p.planLock?.rows,
    accepted = p.agreement.signedAt?.slice(0, 10) || "",
    final = rows?.[rows.length - 1]?.date || p.planLock?.deadline || offer?.finalDue || "",
    second = rows?.[1]?.date || offer?.secondDue || "";
  const status =
    plan.players[p.id]?.status || (p.withdrawn ? "Removed" : accepted ? "Confirmed" : "Invited");
  return {
    id: p.id,
    name: p.name,
    role: p.roleType,
    rosterStatus: status,
    note: plan.players[p.id]?.note || "",
    acceptedPolicy: plan.players[p.id]?.acceptedPolicy || "",
    acceptedExplanation: plan.players[p.id]?.acceptedExplanation || null,
    uniformReleasedAt: plan.players[p.id]?.uniformReleasedAt || "",
    agreedLateFee: plan.players[p.id]?.latePolicy?.fee || 0,
    agreedLateFeeBps: terms?.bps || 0,
    automaticPayments: Boolean(plan.players[p.id]?.automaticPayments),
    acceptedSeasonFee: plan.players[p.id]?.acceptedFeeCents ?? total,
    lateFeeApplied: plan.players[p.id]?.lateFeeApplied || 0,
    accepted,
    total,
    paid: paid(p),
    credit: credit(p),
    signed: Boolean(p.feeLock),
    ...paymentStatus(
      total,
      paid(p) + credit(p),
      accepted,
      second,
      final,
      asOf,
      policy,
      status,
      rows?.length
        ? rows.map((r, i) => ({
            amount: Math.round(r.amount * 100),
            due: r.date,
            label:
              (isIndependent(agreedBudget) && r.label
                ? independentInstallmentLabel({ label: r.label })
                : "") ||
              r.label ||
              (i === 0 ? "Deposit" : i === rows.length - 1 ? "Final payment" : `Payment ${i + 1}`),
          }))
        : previewSchedule,
    ),
    ...(plan.players[p.id]?.independent?.agreements.length
      ? {
          depositPaid:
            paid(p) + credit(p) >=
            plan.players[p.id]
              .independent!.installments.filter((r) => r.kind === "uniform")
              .reduce((sum, r) => sum + r.amount, 0),
          uniformReady:
            paid(p) + credit(p) >=
              plan.players[p.id]
                .independent!.installments.filter((r) => r.kind === "uniform")
                .reduce((sum, r) => sum + r.amount, 0) && status === "Confirmed",
        }
      : {}),
    ...(!p.feeLock && !offer
      ? { status: "Awaiting published fee", rows: [], uniformReady: false }
      : {}),
    uniformCutoff: plan.budget.uniformCutoff,
  };
}
export async function feeWorkspace(sql: Sql, userId: string) {
  return withFinancialContext(sql, userId, "read", (tx, context) =>
    feeWorkspaceInTransaction(tx, context, today()),
  );
}

/** Internal read adapter for callers already inside the financial transaction.
 * The supplied context must have been issued for this exact transaction. */
export async function feeWorkspaceInTransaction(
  tx: Sql,
  issuedContext: FinancialContext,
  asOf: string,
) {
  const context = await financialReadSnapshotInTransaction(tx, issuedContext, "read");
  day.parse(asOf);
  if (!context.clubExists) throw Error("Team records are unavailable.");
  const me = context.principal,
    club = context.club;
  // All presentation normalization stays detached from the authoritative basis.
  const rows = structuredClone(context.feePlans),
    activities = context.activities;
  const canGuard = (player: Player) =>
    context.mode === "basis"
      ? isFinancialGuardian(context, player.teamId, player.id)
      : guardian(player, me);
  const canCoach = (team: Team) => isFinancialCoach(context, team);
  const canViewPlayer = (player: Player) =>
    canGuard(player) || (me.role === "player" && me.playerIds.includes(player.id));
  for (const row of rows)
    if (row.payload.status !== "closed" && !isIndependent(row.payload.budget))
      row.payload.budget = {
        ...row.payload.budget,
        tournament: row.payload.budget.scheduleCostsAutomatic
          ? seasonEntryCosts(
              activities.filter((a) => a.team_id === row.team_id).map((a) => a.payload),
              row.payload.budget,
              club.catalog,
              club.teams.find((t) => t.id === row.team_id)?.tournamentIds || [],
            )
          : row.payload.budget.tournament,
        hotelNightly: row.payload.budget.hotelNightly || 0,
        hotelNights: seasonHotelNights(
          activities.filter((a) => a.team_id === row.team_id).map((a) => a.payload),
          row.payload.budget,
        ),
      };
  const overheadMaster = (await loadBudgetMaster(tx, context)).value;
  const admin = me.role === "admin";
  const expenseRecords = admin
    ? await tx<RecordRow>`select id,kind,payload from finance_records where kind in ('payable','payment','budgetAssignment','teamBudgetTransfer')`
    : [];
  const teams = club.teams
    .filter((t) => admin || canCoach(t) || t.roster.some((p) => canViewPlayer(p)))
    .map((t) => {
      const row = rows.find((r) => r.team_id === t.id),
        p = row ? { ...row.payload, revision: row.revision } : initial(t),
        coach = canCoach(t);
      if (p.published && !p.publishedBudget) p.publishedBudget = structuredClone(p.budget);
      if (p.status !== "closed")
        p.budget = teamSeasonOverhead(
          pendingGas(linkedPODraft(linkedPricingDraft(p, overheadMaster, t), overheadMaster, t)),
          overheadMaster,
        );
      const players = t.roster
        .filter(
          (x) =>
            admin || (!coach && me.role !== "player" && canGuard(x) && (p.published || x.feeLock)),
        )
        .map((x) => ({
          ...playerView(t, x, p, asOf),
          canPay: me.role !== "player" && canGuard(x),
          canAccept:
            me.role !== "player" &&
            canGuard(x) &&
            (x.roleType !== "po" ||
              (offersPO(p.budget, t.sport) && offersPO(p.publishedBudget || p.budget, t.sport))),
        }));
      const events = paymentEvents(context, t, p.budget);
      const active = t.roster.filter(
        (x) =>
          p.players[x.id]?.status === "Roster Hold" ||
          (!x.withdrawn && p.players[x.id]?.status !== "Removed"),
      );
      const forecast = project(
        budgetForRoster(p.budget, active),
        active.filter((x) => x.roleType === "full").length,
        active.filter((x) => x.roleType === "po").length,
        p.expenses,
        p.status === "closed",
      );
      const additionalPlayers = [
        ...active.filter((x) => x.roleType === "full").slice(p.budget.baseline),
        ...active.filter((x) => x.roleType === "po"),
      ].map((x) => ({
        id: x.id,
        name: x.name,
        ...additionalPlayerContribution(
          p.budget,
          x.roleType,
          p.budget.additionalPlayerCosts?.find((c) => c.playerId === x.id) || {
            insurance: 0,
            registration: 0,
            other: 0,
          },
        ),
      }));
      const contributionReportComplete = t.roster.every(
        (x) =>
          !paid(x) ||
          (x.feeLock &&
            p.players[x.id]?.membershipAllocation !== undefined &&
            (p.players[x.id]?.organizationAllocation !== undefined ||
              x.feeLock.policyVersion === "fee-plan-" + p.published?.revision)),
      );
      const totalCollected = sum(t.roster.map(paid)),
        totalCredits = sum(t.roster.map(credit)),
        expenseTotals = teamExpenseTotals(p, expenseRecords, t.id),
        expensesPaid = expenseTotals.paid,
        expensesUnpaid = expenseTotals.unpaid;
      const recognition = Object.values(p.players).reduce(
        (r, x) => {
          if (!x.serviceStart || !x.serviceEnd) return r;
          const a = membershipRecognition(
            (x.membershipAllocation || 0) + (x.accessAllocation || 0),
            x.serviceStart,
            x.serviceEnd,
            asOf,
          );
          return { earned: r.earned + a.earned, deferred: r.deferred + a.deferred };
        },
        { earned: 0, deferred: 0 },
      );
      // Cash-basis component reporting uses frozen agreement allocations, never draft prices.
      const organizationAndProgramRevenue = sum(
        t.roster.map((x) => {
          const record = p.players[x.id];
          const total = Math.round((x.feeLock?.amount || 0) * 100);
          if (!total) return 0;
          const agreed = p.publishedBudget;
          const organization =
            record?.organizationAllocation ??
            (agreed ? (x.roleType === "po" ? agreed.poOrg : agreed.fullOrg) : 0);
          const allocation =
            (record?.membershipAllocation || 0) + (record?.accessAllocation || 0) + organization;
          return Math.min(paid(x), Math.floor(allocation * Math.min(1, paid(x) / total)));
        }),
      );
      const teamOperatingRevenue = totalCollected - organizationAndProgramRevenue;
      const teamOperatingContribution = teamOperatingRevenue - expensesPaid - expensesUnpaid;
      const totalTeamAssociatedContribution =
        teamOperatingContribution + organizationAndProgramRevenue;
      const realized =
        totalCollected -
        expensesPaid -
        expensesUnpaid -
        p.budget.overhead -
        p.budget.reserve -
        recognition.deferred;
      const actualDistributable =
        p.status === "closed" &&
        expensesUnpaid === 0 &&
        expenseTotals.unverifiedPaid === 0 &&
        expenseTotals.sent === 0
          ? Math.max(0, realized)
          : 0;
      const contingencyFunded = Math.min(
        forecast.reserve,
        sum(
          t.roster.map((x) => {
            const allocation = p.players[x.id]?.contingencyAllocation || 0;
            const total = Math.round((x.feeLock?.amount || 0) * 100);
            return total ? Math.floor(allocation * Math.min(1, paid(x) / total)) : 0;
          }),
        ),
      );
      return {
        id: t.id,
        independent: isIndependent(p.budget),
        poEnabled: offersPO(p.budget, t.sport),
        seasonLabel: t.seasonLabel,
        name: t.name,
        closed: t.closed,
        access: admin ? ("admin" as const) : coach ? ("coach" as const) : ("family" as const),
        revision: p.revision,
        ...(context.mode === "basis" ? { basisVersion: context.version! } : {}),
        status: p.status,
        publication: p.published ? currentMembershipOffer(p.published) : null,
        players,
        events,
        choices:
          admin || coach
            ? {
                poRosterLimit: offersPO(p.budget, t.sport)
                  ? (p.budget.poRosterLimit ?? poRosterLimit(t.age))
                  : 0,
                hotelNightly: p.budget.hotelNightly || 0,
                hotelNights: p.budget.hotelNights || 0,
                tournament: p.budget.tournament,
                uniformId: p.budget.uniformId,
                canTournament: p.budget.coachTournament && !p.budget.scheduleCostsAutomatic,
                canUniform: p.budget.coachUniform,
                uniforms: p.uniforms
                  .filter((u) => u.active)
                  .map((u) => ({
                    id: u.id,
                    name: u.name,
                    items: u.items,
                    price: u.price,
                    photos: u.photos || [],
                  })),
                full: calculateFees(p.budget).full,
                po: offersPO(p.budget, t.sport) ? calculateFees(p.budget).po : 0,
              }
            : null,
        private: admin
          ? {
              plan: {
                ...p,
                budget: withoutRetiredMembershipPricing(p.budget),
                ...(p.publishedBudget
                  ? { publishedBudget: withoutRetiredMembershipPricing(p.publishedBudget) }
                  : {}),
                ...(p.published ? { published: currentMembershipOffer(p.published) } : {}),
              },
              pricingTeam: {
                age: t.age,
                sport: t.sport,
                seasonLabel: t.seasonLabel,
                seasons: t.seasons,
              },
              pricingRevisionNeeded: pricingRevisionNeeded(p, p.budget, deadline(p.budget, events)),
              automaticCollectionsAvailable: teamCollectionsEnabled(
                { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
                "production",
              ),
              feeHealth: (() => {
                const health = publicationHealth(p.budget, {
                  key: p.defaults?.key,
                  seasonLabel: t.seasonLabel,
                  finalDue: deadline(p.budget, events),
                  today: asOf,
                });
                const pending = [
                  ...health.pending,
                  ...publicationCostIssues(
                    p.budget,
                    activities.filter((a) => a.team_id === t.id).map((a) => a.payload),
                    club.catalog,
                    t.tournamentIds,
                  ),
                ];
                return {
                  ...health,
                  pending,
                  ready: health.ready && !pending.length,
                  status:
                    pending.length && health.status !== "UNDERFUNDED"
                      ? "INCOMPLETE"
                      : health.status,
                };
              })(),
              forecast,
              additionalPlayers,
              actual: {
                totalCollected,
                contributionReportComplete,
                teamOperatingRevenue,
                teamOperatingContribution,
                organizationAndProgramRevenue,
                totalTeamAssociatedContribution,
                totalCredits,
                expensesPaid,
                expensesUnpaid,
                expensesUnverifiedPaid: expenseTotals.unverifiedPaid,
                expensesSent: expenseTotals.sent,
                ...recognition,
                actualDistributable,
                contingencyFunded,
                fundedContingencyRemaining: Math.max(
                  0,
                  contingencyFunded - expenseTotals.contingencyCommitted,
                ),
                nolan: Math.floor((actualDistributable * p.budget.nolanBps) / 10000),
                steve:
                  actualDistributable -
                  Math.floor((actualDistributable * p.budget.nolanBps) / 10000),
              },
            }
          : null,
      };
    });
  const business = admin ? context.feeBusiness.find((row) => row.id === "business") : undefined;
  return {
    admin,
    teams,
    business: admin
      ? {
          revision: business?.revision || 0,
          ...(context.mode === "basis" ? { basisVersion: context.version! } : {}),
          value: business?.payload || {
            overhead: 0,
            reserve: 0,
            nolanBps: 5000,
            period: "",
            teamIds: [],
          },
        }
      : null,
  };
}
export async function mutateFeePlan(sql: Sql, userId: string, raw: z.infer<typeof feeAction>) {
  const request = feeAction.parse(raw);
  await withFinancialContext(sql, userId, "read", async (tx, context) => {
    if (!context.clubExists) throw Error("Team records are unavailable.");
    const me = context.principal,
      club = structuredClone(context.club);
    const reference =
      context.mode === "basis"
        ? "playerId" in request
          ? resolveFinancialAgreement(context.basis!, {
              teamId: request.teamId,
              playerId: request.playerId,
            })
          : resolveFinancialTeam(context.basis!, { teamId: request.teamId })
        : null;
    const t = club.teams.find((team) => team.id === (reference?.team.id || request.teamId));
    if (!t) throw Error("Team not found.");
    const input =
      reference && "player" in reference && "playerId" in request
        ? { ...request, teamId: t.id, playerId: reference.player.id }
        : { ...request, teamId: t.id };
    const row = context.feePlans.find((row) => row.team_id === t.id);
    let p = row ? { ...structuredClone(row.payload), revision: row.revision } : initial(t);
    // A frozen season without a captured plan has no implicitly created offer.
    if (
      context.mode === "basis" &&
      !row &&
      !(
        me.owner &&
        (input.action === "save" ||
          input.action === "applyDefaults" ||
          (input.action === "publish" && input.draft))
      )
    )
      throw Error("Financial fee plan requires explicit owner enrollment.");
    if (context.mode === "basis" && input.basisVersion !== context.version)
      throw Error("Financial basis changed. Refresh before saving.");
    if (p.revision !== input.revision) throw Error("This plan changed. Reload before saving.");
    if (
      input.action === "publish" &&
      input.draft &&
      (isIndependent(p.budget) || isIndependent(input.draft.budget))
    )
      throw Error("Use the independent-team publication control for this funding model.");
    const admin = me.role === "admin";
    const noticeFilter = {
      teamId: t.id,
      ...("playerId" in input ? { playerId: input.playerId } : {}),
    };
    const unchangedNotices =
      me.owner && ["publish", "publishIndependent"].includes(input.action)
        ? await (
            await import("./fee-notifications.server")
          ).feeReadyCandidateIds(tx, userId, noticeFilter)
        : [];
    if (
      isIndependent(p.budget) ||
      (input.action === "save" && isIndependent(input.budget)) ||
      input.action === "publishIndependent" ||
      input.action.startsWith("independent")
    ) {
      await mutateIndependentProspects(tx, context, t, p, input);
      if (["publish", "publishIndependent", "independentOffer"].includes(input.action))
        await (
          await import("./fee-notifications.server")
        ).queueFeeReadyInTransaction(tx, userId, noticeFilter, unchangedNotices);
      return;
    }
    if (!admin && input.action !== "propose" && input.action !== "accept")
      throw Error("Admin access required.");
    if (p.status === "closed") throw Error("This season is financially closed.");
    if (p.published && !p.publishedBudget) p.publishedBudget = structuredClone(p.budget);
    if (admin) pinSpendingBudget(p);
    const currentMaster = (await loadBudgetMaster(tx, context)).value;
    if (input.action !== "accept") p.budget = linkedPricingDraft(p, currentMaster, t);
    p.budget = await withScheduledHotels(tx, t.id, p.budget, context);
    if (input.action === "applyDefaults") {
      if (p.published)
        throw Error(
          "Apply defaults only to an unpublished draft. Published fees require individual admin edits.",
        );
      const master = await loadBudgetMaster(tx, context),
        row = master.value.rows.find((r) => rowKey(r) === input.key && r.sport === t.sport);
      if (!row) throw Error("Choose a matching sport's matrix row.");
      const defaults = budgetFromMatrix(t, master.value, row);
      p.budget = {
        ...p.budget,
        ...defaults,
        start: p.budget.start || t.seasonStart,
        end: p.budget.end || t.seasonEnd,
        uniformId: p.budget.uniformId,
        uniformCost: p.budget.uniformCost,
        policy: p.budget.policy,
        reinstatement: p.budget.reinstatement,
      };
      p.budget = await withScheduledHotels(tx, t.id, p.budget, context);
      p.defaults = {
        key: rowKey(row),
        revision: master.revision,
        appliedAt: new Date().toISOString(),
      };
      const year = p.budget.start.slice(0, 4) || t.seasonLabel.match(/20\d{2}/)?.[0];
      if (year) {
        t.seasons = (
          row.season === "springSummer"
            ? ["Spring", "Summer"]
            : [row.season[0].toUpperCase() + row.season.slice(1)]
        ).map((s) => s + " " + year);
        t.seasonLabel = t.seasons.join(" & ");
        t.months = p.budget.months;
      }
      p.status = "draft";
    }
    if (input.action === "close" && input.draft)
      throw Error("Save draft changes before closing the season.");
    const draft =
      input.action === "save" ? input : input.action === "publish" ? input.draft : undefined;
    if (draft) {
      for (const expense of draft.expenses) {
        const old = p.expenses.find((e) => e.id === expense.id);
        if (expense.paid && (!old?.paid || old.cents !== expense.cents)) {
          const [verified] = await tx<{
            payload: { paid: number; legacyPaid?: boolean };
          }>`select payload from finance_records where kind='payable' and id=${"expense:" + t.id + ":" + expense.id}`;
          if (!verified || verified.payload.legacyPaid || verified.payload.paid < expense.cents)
            throw Error(
              "Record and reconcile this expense in Finance before marking it paid. A budget checkbox cannot verify payment.",
            );
        }
      }
      if (
        p.publishedBudget &&
        sum(draft.expenses.map((e) => e.cents)) >
          calculateFees(p.publishedBudget).externalDirect +
            calculateFees(p.publishedBudget).contingency
      )
        throw Error(
          "Recorded expenses exceed the published preseason external-cost and contingency budget.",
        );
      p = checkBudget({
        ...p,
        budget: await withScheduledHotels(tx, t.id, pendingGas(draft.budget), context),
        uniforms: draft.uniforms,
        expenses: draft.expenses,
        status: "draft",
      });
    }
    if (input.action === "propose") {
      if (!admin && !isFinancialCoach(context, t))
        throw Error("Assigned team coach access required.");
      if (
        !admin &&
        ((!p.budget.coachTournament && input.tournament !== p.budget.tournament) ||
          (!p.budget.coachUniform && input.uniformId !== p.budget.uniformId))
      )
        throw Error("This selection is controlled by Front Office.");
      p = checkBudget({
        ...p,
        budget: {
          ...p.budget,
          tournament: p.budget.scheduleCostsAutomatic ? p.budget.tournament : input.tournament,
          uniformId: input.uniformId,
        },
        status: "pending",
      });
    }
    if (input.action !== "accept")
      p.budget = linkedPODraft(linkedPricingDraft(p, currentMaster, t), currentMaster, t);
    p.budget = teamSeasonOverhead(withBillableMonths(p.budget), currentMaster);
    if (draft) {
      const additional = t.roster.filter((x) => !x.withdrawn);
      const extraIds = new Set(
        [
          ...additional.filter((x) => x.roleType === "full").slice(p.budget.baseline),
          ...additional.filter((x) => x.roleType === "po"),
        ].map((x) => x.id),
      );
      if ((p.budget.additionalPlayerCosts || []).some((c) => !extraIds.has(c.playerId)))
        throw Error(
          "Incremental insurance/registration entries must identify an additional active player.",
        );
    }
    if (
      (input.action === "save" && p.budget.poRosterLimit !== row?.payload.budget.poRosterLimit) ||
      input.action === "publish"
    )
      await assertRosterCapacity(tx, t, p.budget, context);
    if (input.action === "publish") {
      checkBudget(p);
      const costIssues = publicationCostIssues(
        p.budget,
        context.activities.filter((a) => a.team_id === t.id).map((a) => a.payload),
        club.catalog,
        t.tournamentIds,
      );
      const health = publicationHealth(p.budget, {
        key: p.defaults?.key,
        seasonLabel: t.seasonLabel,
        finalDue: deadline(p.budget, paymentEvents(context, t, p.budget)),
        today: today(),
      });
      if (!health.ready)
        throw Error(
          "Fee health: " +
            (health.pending.join(" ") || "Projected fees do not fully fund costs and targets."),
        );
      if (costIssues.length) throw Error("Fee publication: " + costIssues.join(" "));
      const poEnabled = offersPO(p.budget, t.sport);
      if (!poEnabled && t.roster.some((x) => !x.withdrawn && x.roleType === "po" && !x.feeLock))
        throw Error(
          "Resolve unaccepted pitcher-only roster assignments before publishing full-player-only fees.",
        );
      p.budget.poEnabled = poEnabled;
      const final = deadline(p.budget, paymentEvents(context, t, p.budget)),
        b = p.budget;
      if (
        !final ||
        (!b.eventPaymentSchedule &&
          ((!b.paymentSchedule && b.secondDue && b.secondDue > final) || final < today()))
      )
        throw Error("Set a future final deadline and a second payment date no later than it.");
      if (!b.policy.trim() || !b.reinstatement.trim())
        throw Error(
          "Enter the approved payment/refund policy and reinstatement rules before publishing.",
        );
      requireFeeExplanation(b.parentExplanation);
      const f = calculateFees(b);
      const schedules = {
        full: scheduleRows(b, f.full, "full", final, today()).map((r, i) =>
          i || b.eventPaymentSchedule ? r : { ...r, due: "" },
        ),
        po: poEnabled
          ? scheduleRows(b, f.po, "po", final, today()).map((r, i) =>
              i || b.eventPaymentSchedule ? r : { ...r, due: "" },
            )
          : [],
      };
      for (const rows of Object.values(schedules)) {
        let previous = b.eventPaymentSchedule && pastDueReviewed(b, final) ? "" : today();
        for (const row of b.eventPaymentSchedule ? rows : rows.slice(1)) {
          if (!row.due || row.due < previous || row.due > final)
            throw Error(
              "Payment dates must be in order, no earlier than today and no later than the final deadline.",
            );
          previous = row.due;
        }
      }
      const offer = publicationOffer(b, poEnabled, final, today());
      if (input.draft && input.reviewedOffer !== JSON.stringify(offer))
        throw Error(
          "Player obligations changed since review. Save the draft, reload, and review the current amounts, dates and terms before publishing.",
        );
      p.published = {
        ...offer,
        at: new Date().toISOString(),
        revision: p.revision + 1,
      };
      p.status = "published";
      p.publishedBudget = structuredClone(b);
      pinSpendingBudget(p);
      const uniform = p.uniforms.find((u) => u.id === b.uniformId);
      if (uniform) {
        const prior = club.uniforms.find((u) => u.id === uniform.id);
        const publishedUniform = {
          id: uniform.id,
          name: uniform.name,
          sport: t.sport,
          price: uniform.price / 100,
          items: uniform.items
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          colourways: prior?.colourways || [],
          sizeFields: prior?.sizeFields || ["Jersey", "Pants", "Hat"],
        };
        club.uniforms = [...club.uniforms.filter((u) => u.id !== uniform.id), publishedUniform];
        t.uniformPackageId = uniform.id;
      }
      t.uniformDeadline = b.uniformCutoff;
    }
    if (input.action === "roster") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player) throw Error("Player not found.");
      const view = playerView(t, player, p);
      if (input.status === "Roster Hold" && !view.holdEligible)
        throw Error("Roster hold threshold has not been reached.");
      if (input.status === "Removed" && !view.removalEligible)
        throw Error("Removal threshold has not been reached.");
      if (
        input.status === "Confirmed" &&
        ["Roster Hold", "Removed"].includes(view.rosterStatus) &&
        view.balance > 0
      )
        throw Error("Settle the outstanding balance before reinstatement.");
      if (input.status === "Confirmed" && player.withdrawn)
        await assertRosterAssignment(tx, t, player.roleType, player.id, "", context);
      p.players[player.id] = { ...p.players[player.id], status: input.status, note: input.note };
      player.withdrawn = input.status === "Removed" || input.status === "Roster Hold";
    }
    if (input.action === "playerRole") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player) throw Error("Player not found.");
      if (player.feeLock)
        throw Error(
          "This player has an agreed fee. A role change requires separate agreement review.",
        );
      if (input.role === "po" && !offersPO(p.budget, t.sport))
        throw Error("This team does not offer pitcher-only roster spots.");
      await assertRosterAssignment(tx, t, input.role, player.id, "", context);
      player.roleType = input.role;
    }
    if (input.action === "accept") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player || !isFinancialGuardian(context, t.id, player.id))
        throw Error("Only this player’s guardian can accept the fee.");
      if (!p.published) throw Error("Front Office has not published fees.");
      const { requirePilotAcknowledgment } = await import("../enrollment/enrollment.server");
      await requirePilotAcknowledgment(tx, userId, t.id, player.id);
      if (player.feeLock)
        throw Error(
          "An agreed fee already exists. Front Office must review amendments separately.",
        );
      if (
        player.roleType === "po" &&
        !(offersPO(p.budget, t.sport) && offersPO(p.publishedBudget || p.budget, t.sport))
      )
        throw Error("This team does not offer pitcher-only roster spots.");
      if (today() > p.published.finalDue)
        throw Error(
          "The final payment deadline has passed. Contact Front Office before accepting.",
        );
      const offer = currentMembershipOffer(p.published);
      const amount = player.roleType === "po" ? offer.po : offer.full,
        schedule =
          offer.schedules?.[player.roleType === "po" ? "po" : "full"] ||
          scheduleRows(
            p.publishedBudget || p.budget,
            amount,
            player.roleType === "po" ? "po" : "full",
            p.published.finalDue,
          ),
        parts = schedule.map((r) => r.amount),
        date = today();
      const agreedForDates = p.publishedBudget || p.budget;
      const acceptedSchedule =
        !agreedForDates.eventPaymentSchedule &&
        !agreedForDates.paymentSchedule &&
        !agreedForDates.secondDue
          ? scheduleRows(
              agreedForDates,
              amount,
              player.roleType === "po" ? "po" : "full",
              p.published.finalDue,
              date,
            )
          : schedule;
      player.feeLock = {
        amount: amount / 100,
        lockedAt: new Date().toISOString(),
        policyVersion: "fee-plan-" + p.published.revision,
        components: { season: amount / 100 },
      };
      player.planLock = {
        dep: parts[0] / 100,
        deadline: p.published.finalDue,
        planType: "custom",
        rows: acceptedSchedule.map((r) => ({
          date: agreedForDates.eventPaymentSchedule ? r.due : !r.due || r.due < date ? date : r.due,
          amount: r.amount / 100,
        })),
      };
      const agreed = p.publishedBudget || p.budget;
      player.depositPaid = paid(player) >= parts[0];
      player.agreement = {
        version: "fee-plan-" + p.published.revision,
        signedBy: input.name,
        signedAt: new Date().toISOString(),
      };
      p.players[player.id] = {
        status: "Confirmed",
        note: "Guardian accepted the published fee and policy.",
        acceptedPolicy: offer.policy,
        acceptedExplanation: offer.explanation ? structuredClone(offer.explanation) : undefined,
        ...(agreed.automaticPayments
          ? {
              automaticPayments: true as const,
              acceptedFeeCents: amount,
              acceptedSchedule: player.planLock.rows.map((r) => ({
                date: r.date,
                amountCents: Math.round(r.amount * 100),
              })),
            }
          : {}),
        organizationAllocation: player.roleType === "po" ? agreed.poOrg : agreed.fullOrg,
        membershipAllocation:
          player.roleType === "po" ? calculateFees(agreed).poMember : calculateFees(agreed).member,
        contingencyAllocation:
          player.roleType === "po"
            ? calculateFees(agreed).poContingency
            : Math.ceil(calculateFees(agreed).contingency / agreed.baseline),
        serviceStart: agreed.start,
        serviceEnd: agreed.end,
        latePolicy: {
          fee: agreed.lateFee,
          ...(agreed.lateFeeBps ? { bps: agreed.lateFeeBps } : {}),
          grace: agreed.graceDays,
          hold: agreed.holdDays,
          removal: agreed.removalDays,
        },
      };
    }
    if (input.action === "lateFee") {
      const player = t.roster.find((x) => x.id === input.playerId),
        record = p.players[input.playerId];
      if (
        !player?.feeLock ||
        !player.planLock ||
        !record?.latePolicy ||
        (!record.latePolicy.fee && !record.latePolicy.bps)
      )
        throw Error("No agreed late fee is available.");
      if (record.latePolicy.bps === 2000) {
        if (!record.acceptedSchedule || !record.acceptedFeeCents)
          throw Error("Original accepted fee schedule is missing.");
        const terms: CollectionTerms = {
          version: 1,
          acceptedFeeCents: record.acceptedFeeCents,
          rows: record.acceptedSchedule,
          graceDays: record.latePolicy.grace,
          lateFeeBps: 2000,
        };
        const rows = installmentRemaining(
          terms,
          paid(player) + credit(player),
          record.lateFeeInstallments,
        );
        const eligible = rows.find(
          (r) =>
            (input.installmentIndex === undefined || r.index === input.installmentIndex) &&
            r.remainingCents > 0 &&
            (Date.parse(today() + "T12:00:00Z") - Date.parse(r.date + "T12:00:00Z")) / 86400000 >
              terms.graceDays &&
            !record.lateFeeInstallments?.some((f) => f.index === r.index),
        );
        if (!eligible)
          throw Error("No unassessed overdue installment is past its agreed grace period.");
        const failed =
          await tx`select r.id from team_collection_runs r join team_collection_authorizations a on a.id=r.authorization_id where a.environment='production' and a.team_id=${t.id} and a.player_id=${player.id} and a.locked_at=${player.feeLock.lockedAt} and r.installment_index=${eligible.index} and r.status='failed' and r.primary_failure is not null and r.backup_failure is not null`;
        if (!failed.length)
          throw Error(
            "Confirmed primary and backup card failures are required before this late fee can be assessed.",
          );
        const fee = installmentLateFee(eligible.remainingCents);
        if (fee <= 0) throw Error("No late fee is due.");
        record.lateFeeInstallments = [
          ...(record.lateFeeInstallments || []),
          {
            index: eligible.index,
            cents: fee,
            baseCents: eligible.remainingCents,
            at: new Date().toISOString(),
          },
        ];
        record.lateFeeApplied = (record.lateFeeApplied || 0) + fee;
        player.feeLock.amount = (Math.round(player.feeLock.amount * 100) + fee) / 100;
        player.planLock.rows.push({
          date: today(),
          amount: fee / 100,
          label: `20% late fee - installment ${eligible.index + 1}`,
        });
        player.planLock.rows.sort((a, b) => a.date.localeCompare(b.date));
      } else {
        if (record.lateFeeApplied) throw Error("The one-time late fee has already been applied.");
        if (playerView(t, player, p).days <= record.latePolicy.grace)
          throw Error("The agreed grace period has not elapsed.");
        const fee = record.latePolicy.fee;
        player.feeLock.amount = (Math.round(player.feeLock.amount * 100) + fee) / 100;
        const last = player.planLock.rows.at(-1);
        if (!last) throw Error("Payment schedule missing.");
        last.amount = (Math.round(last.amount * 100) + fee) / 100;
        record.lateFeeApplied = fee;
      }
    }
    if (input.action === "releaseUniform") {
      const player = t.roster.find((x) => x.id === input.playerId);
      if (!player) throw Error("Player not found.");
      const view = playerView(t, player, p);
      if (!player.feeLock || !view.uniformReady)
        throw Error("Uniform release requires the full deposit and a confirmed roster spot.");
      if (p.budget.uniformCutoff && today() > p.budget.uniformCutoff)
        throw Error(
          "The uniform cutoff has passed. Review vendor lead time and update the cutoff first.",
        );
      p.players[player.id] = {
        ...p.players[player.id],
        status: "Confirmed",
        note: p.players[player.id]?.note || "",
        uniformReleasedAt: new Date().toISOString(),
      };
    }
    if (input.action === "close") {
      if (!(await loadBudgetMaster(tx, context)).value.overheadReviewed)
        throw Error(
          "Review actual facility costs and staffing before closing the season financially.",
        );
      const closingRecords =
        await tx<RecordRow>`select id,kind,payload from finance_records where kind in ('payable','payment','budgetAssignment','teamBudgetTransfer')`;
      const expenses = teamExpenseTotals(p, closingRecords, t.id);
      const spending = teamBudgetLedger(p, closingRecords, t.id);
      if (
        !p.published ||
        today() <= p.budget.end ||
        expenses.unpaid > 0 ||
        expenses.unverifiedPaid > 0 ||
        expenses.sent > 0 ||
        spending?.unallocated.some((e) => e.amount > 0 && (e.state !== "canceled" || e.paid > 0)) ||
        spending?.rows.some((line) => line.remaining < 0) ||
        t.roster.some((x) => x.feeLock && Math.round(x.feeLock.amount * 100) > paid(x) + credit(x))
      )
        throw Error(
          "Close only after the season ends, all Finance and fee-plan expenses are assigned and bank-reconciled within budget, and player balances are reconciled.",
        );
      p.status = "closed";
    }
    p.revision++;
    p.history = [
      ...p.history,
      {
        at: new Date().toISOString(),
        actor: me.name,
        action:
          input.action +
          (input.action === "save"
            ? " pricing " +
              JSON.stringify({
                before: {
                  membershipMonthly: row?.payload.budget.membershipMonthly,
                  poMembershipMonthly: row?.payload.budget.poMembershipMonthly,
                  contingencyBps: row?.payload.budget.contingencyBps,
                  eventPaymentSchedule: row?.payload.budget.eventPaymentSchedule,
                  inheritance: row?.payload.budget.pricingInheritance,
                },
                after: {
                  membershipMonthly: p.budget.membershipMonthly,
                  poMembershipMonthly: p.budget.poMembershipMonthly,
                  contingencyBps: p.budget.contingencyBps,
                  eventPaymentSchedule: p.budget.eventPaymentSchedule,
                  inheritance: p.budget.pricingInheritance,
                },
              })
            : ""),
      },
    ].slice(-500);
    if (context.mode === "basis") {
      // Read-time compatibility synthesis is never a financial amendment.
      if (!row?.payload.publishedBudget && input.action !== "publish") delete p.publishedBudget;
      if (input.action === "accept") p.budget = structuredClone(row!.payload.budget);
      if (input.action === "propose")
        p.budget = {
          ...structuredClone(row!.payload.budget),
          tournament: p.budget.tournament,
          uniformId: p.budget.uniformId,
          uniformCost: p.budget.uniformCost,
        };
    }
    await auditFeeExplanation(
      tx,
      me.userId,
      t.id,
      input.action,
      row?.payload.budget.parentExplanation,
      p.budget.parentExplanation,
      p.revision,
    );
    await commitFinancialFeePlanInTransaction(tx, context, {
      request,
      expectedBasisVersion: request.basisVersion,
      team: t,
      // Match the existing JSONB boundary: omitted optional fields do not become
      // non-JSON undefined values inside an immutable basis version.
      plan: JSON.parse(JSON.stringify(p)) as FeePlan,
      uniforms: club.uniforms,
    });
    if (input.action === "publish")
      await (
        await import("./fee-notifications.server")
      ).queueFeeReadyInTransaction(tx, userId, noticeFilter, unchangedNotices);
  });
  return { ok: true };
}
export async function setFeeBusiness(
  sql: Sql,
  userId: string,
  input: { revision: number; basisVersion?: number; value: FeeBusiness },
) {
  const value = businessSchema.parse(input.value);
  await withFinancialContext(sql, userId, "owner", async (tx, context) => {
    if (!context.clubExists) throw Error("Team records are unavailable.");
    await commitFinancialFeeBusinessInTransaction(tx, context, {
      expectedRevision: input.revision,
      expectedBasisVersion: input.basisVersion,
      value,
    });
  });
  return { ok: true };
}

/** Uniform presentation only: never exposes fee budgets or other players. */
export async function teamUniform(sql: Sql, userId: string, teamId: string) {
  return withFinancialContext(sql, userId, "read", async (_tx, context) => {
    if (!context.clubExists) throw Error("Team records are unavailable.");
    const me = context.principal,
      club = context.club;
    const resolvedId =
      context.mode === "basis" ? resolveFinancialTeam(context.basis!, { teamId }).team.id : teamId;
    const team = club.teams.find((t) => t.id === resolvedId);
    if (
      !team ||
      !(
        me.role === "admin" ||
        isFinancialCoach(context, team) ||
        team.roster.some(
          (p) =>
            !p.withdrawn &&
            (isFinancialGuardian(context, team.id, p.id) ||
              me.playerIds.includes(p.id) ||
              (me.email && norm(p.email) === me.email)),
        )
      )
    )
      throw Error("Assigned team access required.");
    const row = context.feePlans.find((row) => row.team_id === resolvedId);
    if (row) {
      const u = row.payload.uniforms.find((u) => u.id === row.payload.budget.uniformId);
      return u ? { name: u.name, items: u.items, photos: u.photos || [] } : null;
    }
    const u = club.uniforms.find((u) => u.id === team.uniformPackageId);
    return u ? { name: u.name, items: u.items.join(", "), photos: [] } : null;
  });
}

/** Assigned coaches see named overdue status; families receive only a team-level boolean. */
export async function teamFundingStatus(sql: Sql, userId: string, teamId: string) {
  return withFinancialContext(sql, userId, "read", async (_tx, context) => {
    if (!context.clubExists) throw Error("Team records are unavailable.");
    const me = context.principal,
      club = context.club;
    const resolvedId =
      context.mode === "basis" ? resolveFinancialTeam(context.basis!, { teamId }).team.id : teamId;
    const t = club.teams.find((t) => t.id === resolvedId);
    if (
      !t ||
      !(
        me.role === "admin" ||
        isFinancialCoach(context, t) ||
        (me.role !== "player" &&
          t.roster.some((p) => !p.withdrawn && isFinancialGuardian(context, t.id, p.id)))
      )
    )
      return null;
    const row = context.feePlans.find((row) => row.team_id === resolvedId);
    const canSeeNames = me.role === "admin" || isFinancialCoach(context, t);
    const players = row
      ? t.roster.filter(
          (p) =>
            p.feeLock &&
            p.agreement.signedAt &&
            row.payload.players[p.id]?.status !== "Removed" &&
            (!p.withdrawn || row.payload.players[p.id]?.status === "Roster Hold"),
        )
      : [];
    const overdue = players.filter((p) => {
      const v = playerView(t, p, row!.payload);
      return v.rows.some(
        (r, i) =>
          r.remaining > 0 &&
          (r.due || (i === 0 ? v.accepted : "")) &&
          (r.due || v.accepted) < today(),
      );
    });
    return {
      overduePlayers: canSeeNames ? overdue.length : null,
      tracking: players.length > 0,
      hasOverduePayments: overdue.length > 0,
      overdueRoster: canSeeNames
        ? overdue.map((p) => ({
            playerId: p.id,
            playerName: p.name,
            guardianNames: [...new Set(p.parents.map((g) => g.name.trim()).filter(Boolean))],
            status: "Overdue" as const,
          }))
        : null,
    };
  });
}

function eventCommitmentView(row: { id: string; revision: number; payload: TeamActivity }) {
  const event = row.payload;
  return {
    id: row.id,
    revision: row.revision,
    title: event.title,
    kind: event.kind,
    date: event.date,
    status: event.status,
    entryFee: event.entryFee || 0,
    travel: event.travel || ("local" as const),
    overnightNights: event.overnightNights || 0,
  };
}

/** An owner-only review surface. Operational candidates are never merged into
 * saved financial commitments merely because this screen was opened. */
export async function financialEventCommitments(sql: Sql, userId: string, teamId: string) {
  return withFinancialContext(sql, userId, "owner", async (tx, context) => {
    if (!context.clubExists) throw Error("Team records are unavailable.");
    if (context.mode !== "basis") return { basisVersion: null, events: [], candidates: [] };
    const { team } = resolveFinancialTeam(context.basis!, { teamId });
    const events = context.activities
      .filter((row) => row.team_id === team.id && row.payload.kind !== "practice")
      .map(eventCommitmentView)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const rows = await tx<{
      id: string;
      revision: number;
      payload: TeamActivity;
    }>`select id::text,revision,payload from team_activities where team_id=${teamId} and payload->>'kind' in ('game','tournament') order by payload->>'date',id`;
    const candidates = rows
      .filter((row) => !context.activities.some((saved) => saved.id === row.id))
      .map((row) => ({ ...eventCommitmentView(row), entryFee: 0 }));
    return { basisVersion: context.version!, events, candidates };
  });
}

export async function amendFinancialEventCommitment(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof financialEventAmendment>,
) {
  const input = financialEventAmendment.parse(raw);
  return withFinancialContext(sql, userId, "owner", async (tx, context) => ({
    ok: true as const,
    ...(await commitFinancialActivityInTransaction(tx, context, {
      expectedBasisVersion: input.basisVersion,
      expectedRevision: input.revision,
      teamId: input.teamId,
      activityId: input.activityId,
      value: {
        date: input.date,
        status: input.status,
        entryFee: input.entryFee,
        travel: input.travel,
        overnightNights: input.overnightNights,
      },
      reason: input.reason,
    })),
  }));
}

export async function admitFinancialEventCommitment(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof financialEventAdmission>,
) {
  const input = financialEventAdmission.parse(raw);
  return withFinancialContext(sql, userId, "owner", async (tx, context) => ({
    ok: true as const,
    ...(await admitFinancialActivityForOwnerInTransaction(tx, context, {
      expectedBasisVersion: input.basisVersion,
      expectedSourceRevision: input.sourceRevision,
      teamId: input.teamId,
      activityId: input.activityId,
      value: {
        date: input.date,
        status: input.status,
        entryFee: input.entryFee,
        travel: input.travel,
        overnightNights: input.overnightNights,
      },
      reason: input.reason,
      confirmed: input.confirmed,
    })),
  }));
}
