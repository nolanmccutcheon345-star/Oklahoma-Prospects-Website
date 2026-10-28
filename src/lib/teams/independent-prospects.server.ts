import { auditFeeExplanation } from "./fee-explanation.server";
import { requireFeeExplanation } from "./fee-explanation";
import type { z } from "zod";
import { createHash } from "node:crypto";
import type { Sql } from "../db";
import {
  commitFinancialFeePlanInTransaction,
  isFinancialGuardian,
  loadFinancialContextInTransaction,
  type FinancialContext,
} from "../finance/context.server";
import { type FeePlan, feeAction } from "./fee-contracts";
import { budgetSchema, organizationDay, type FeeBudget } from "./fee-model";
import {
  independentDraft,
  independentIssues,
  independentPublishedPolicy,
  independentSchedule,
  isIndependent,
  type IndependentInstallment,
} from "./independent-model";
import type { Team, Player } from "./types";

type Action = z.infer<typeof feeAction>;
const received = (p: Player) =>
  Math.round(
    (p.payments.reduce((s, r) => s + r.amount, 0) + p.credits.reduce((s, r) => s + r.amount, 0)) *
      100,
  );
const total = (rows: IndependentInstallment[]) => rows.reduce((s, r) => s + r.amount, 0);

/** The current team integration initiates individual payments in our collection
 * worker. It does not create a Square subscription. Revoke its durable authority
 * and ready retries atomically; submitted attempts remain available to reconcile. */
export async function stopIndependentCollection(
  tx: Sql,
  teamId: string,
  playerId: string,
  actor: string,
  reason: string,
) {
  const rows = await tx<{
    id: string;
  }>`update team_collection_authorizations set status='revoked',updated_at=now() where team_id=${teamId} and player_id=${playerId} and status<>'revoked' returning id`;
  await tx`update team_collection_runs set status='cancelled',updated_at=now() where authorization_id in (select id from team_collection_authorizations where team_id=${teamId} and player_id=${playerId}) and status in ('ready','primary_declined')`;
  for (const row of rows)
    await tx`insert into finance_audit(actor_id,record_id,action,reason) values(${actor},${row.id},'Independent Prospects collection stopped',${reason})`;
}

/** Keep paid/partly paid and accrued obligations stable across a new acceptance.
 * Financial identity is player + team + season + installment.id, not revision. */
export function revisedIndependentSchedule(
  old: IndependentInstallment[],
  next: IndependentInstallment[],
  paid: number,
  today: string,
) {
  let available = Math.max(0, paid);
  const protectedRows = old.filter((row) => {
    const allocated = Math.min(available, row.amount);
    available -= allocated;
    return allocated > 0 || row.due <= today;
  });
  const ids = new Set(protectedRows.map((r) => r.id));
  return [...protectedRows, ...next.filter((r) => !ids.has(r.id))].sort(
    (a, b) =>
      a.due.localeCompare(b.due) ||
      Number(a.kind !== "uniform") - Number(b.kind !== "uniform") ||
      a.id.localeCompare(b.id),
  );
}

export function independentAcceptancePreview(plan: FeePlan, player: Player, today: string) {
  const previous = plan.players[player.id]?.independent,
    budget = previous?.offer?.budget || plan.publishedBudget;
  if (!budget || !plan.published || !isIndependent(budget)) return null;
  const rows = revisedIndependentSchedule(
    previous?.installments || [],
    independentSchedule(budget),
    received(player),
    today,
  );
  const policy = independentPublishedPolicy(budget, rows);
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        budget.independent!.seasonKey,
        player.id,
        plan.revision,
        previous?.offer?.payerUserId || "",
        rows.map((r) => [r.id, r.kind, r.due, r.base, r.processing, r.amount]),
        policy,
      ]),
    )
    .digest("hex");
  return {
    rows,
    policy,
    digest,
    explanation: budget.parentExplanation || null,
    publicationRevision: previous?.offer?.revision || plan.published.revision,
  };
}

function validatedBudget(raw: FeeBudget, today: string, publishing = true) {
  const b = budgetSchema.parse(independentDraft(raw));
  if (!isIndependent(b)) throw Error("Choose Independently Funded Team.");
  if (publishing) requireFeeExplanation(b.parentExplanation);
  const issues = independentIssues(b, today);
  if (issues.length) throw Error(issues.join(" "));
  if (b.independent!.lastDue > b.independent!.seasonEnd)
    throw Error("Billing must end on or before the season end date.");
  if (b.independent!.uniformDue > b.independent!.firstDue)
    throw Error("The initial deposit must be due on or before the first monthly installment.");
  return b;
}

export async function mutateIndependentProspects(
  tx: Sql,
  context: FinancialContext,
  team: Team,
  plan: FeePlan,
  input: Action,
) {
  const actor = context.principal,
    now = new Date().toISOString(),
    today = organizationDay(now);
  if (!actor.owner && input.action !== "accept")
    throw Error("Prospects financial owner access required.");
  const previous = context.feePlans.find((r) => r.team_id === team.id)?.payload;
  const wasIndependent = isIndependent(previous?.budget || {});
  if (!wasIndependent && (previous?.published || team.roster.some((p) => p.feeLock)))
    throw Error(
      "An existing published season cannot be converted. Preserve its agreements and establish a new season explicitly.",
    );
  if (
    plan.independentCancellation &&
    !["independentUniform", "independentAdminBudget"].includes(input.action)
  )
    throw Error(
      "This Prospects billing term was canceled. Existing balances and history remain available.",
    );
  if (input.action === "save" || input.action === "publishIndependent") {
    if (!isIndependent(input.budget))
      throw Error("An independent season cannot be silently converted to organization billing.");
    if (
      previous?.budget.independent &&
      previous.budget.independent.seasonKey !== input.budget.independent?.seasonKey
    )
      throw Error("The season identity cannot change. Establish a new season explicitly.");
    plan.budget = budgetSchema.parse(independentDraft(input.budget));
    if (input.action === "save") {
      if (JSON.stringify(input.expenses) !== JSON.stringify(plan.expenses))
        throw Error(
          "Record Prospects uniform spending in Finance; independent team expenses belong in Team-Managed Expenses.",
        );
      plan.status = "draft";
    }
  }
  if ("adminBudget" in input && input.adminBudget !== undefined) {
    if (!isIndependent(plan.budget)) throw Error("Choose Independently Funded Team first.");
    plan.independentAdmin = input.adminBudget;
  }
  if (input.action === "publish" || input.action === "publishIndependent") {
    const b = validatedBudget(plan.budget, today),
      rows = independentSchedule(b);
    plan.budget = b;
    plan.publishedBudget = structuredClone(b);
    plan.published = {
      full: total(rows),
      po: total(rows),
      schedules: { full: rows, po: rows },
      secondDue: "",
      finalDue: b.independent!.lastDue,
      policy: independentPublishedPolicy(b),
      explanation: b.parentExplanation ? structuredClone(b.parentExplanation) : undefined,
      at: now,
      revision: plan.revision + 1,
    };
    plan.spendingBudget ||= {
      budget: structuredClone(b),
      publishedAt: now,
      publicationRevision: plan.revision + 1,
    };
    plan.status = "published";
  } else if (input.action === "independentOffer") {
    const player = team.roster.find((p) => p.id === input.playerId);
    if (!player || !plan.published) throw Error("Publish this team's Prospects terms first.");
    if (player.feeLock && !plan.players[player.id]?.independent)
      throw Error("Historical organization agreements require separate review.");
    const payer = await loadFinancialContextInTransaction(tx, input.payerUserId);
    if (payer.principal.role === "player" || !isFinancialGuardian(payer, team.id, player.id))
      throw Error("Choose a verified guardian of this player as payer.");
    const b = validatedBudget(input.budget, today);
    if (b.independent!.seasonKey !== plan.budget.independent!.seasonKey)
      throw Error("Player offer belongs to another season.");
    const old = plan.players[player.id] || { status: "Invited" as const, note: "" };
    const independent = old.independent || {
      seasonKey: b.independent!.seasonKey,
      payerUserId: input.payerUserId,
      version: 0,
      installments: [],
      agreements: [],
    };
    if (independent.cancellation)
      throw Error("A withdrawn agreement cannot be reactivated by publishing another offer.");
    independent.offer = {
      budget: b,
      reason: input.reason,
      revision: plan.revision + 1,
      payerUserId: input.payerUserId,
    };
    plan.players[player.id] = { ...old, independent };
  } else if (input.action === "accept") {
    const player = team.roster.find((p) => p.id === input.playerId);
    if (!player || actor.role === "player" || !isFinancialGuardian(context, team.id, player.id))
      throw Error("Only this player's verified guardian can accept.");
    if (!plan.published || !plan.publishedBudget)
      throw Error("Prospects terms have not been published.");
    const { requirePilotAcknowledgment } = await import("../enrollment/enrollment.server");
    await requirePilotAcknowledgment(tx, actor.userId, team.id, player.id);
    const old = plan.players[player.id],
      previousAgreement = old?.independent;
    if (previousAgreement?.cancellation)
      throw Error("The player's future Prospects billing was canceled.");
    if (player.feeLock && !previousAgreement?.offer)
      throw Error(
        "This player's agreement is already accepted. Repeated invitations do not create another obligation.",
      );
    const offer = previousAgreement?.offer;
    if (offer && offer.payerUserId !== actor.userId)
      throw Error("The designated payer must accept this offer.");
    const b = validatedBudget(offer?.budget || plan.publishedBudget, today, false);
    const preview = independentAcceptancePreview(plan, player, today)!;
    if (input.independentOfferDigest !== preview.digest)
      throw Error(
        "The displayed offer or payment allocations changed. Reload and review before accepting.",
      );
    const rows = preview.rows;
    const links = await tx<{
      athlete_id: string;
    }>`select distinct athlete_id from team_dev_roster_links where team_id=${team.id} and roster_player_id=${player.id}`;
    if (links.length > 1)
      throw Error(
        "Resolve this player's duplicate athlete links before accepting financial terms.",
      );
    if (links.length) {
      const aliases = await tx<{
        roster_player_id: string;
      }>`select roster_player_id from team_dev_roster_links where team_id=${team.id} and athlete_id=${links[0].athlete_id} and roster_player_id<>${player.id}`;
      if (aliases.some((a) => plan.players[a.roster_player_id]?.independent?.agreements.length))
        throw Error(
          "This athlete already has an agreement for this team season. Resolve the duplicate registration instead of creating another obligation.",
        );
    }
    if (
      rows.some(
        (r) =>
          r.amount > 0 &&
          r.due < today &&
          !previousAgreement?.installments.some((o) => o.id === r.id),
      )
    )
      throw Error(
        "Late enrollment requires an admin-published individual offer with explicit dates.",
      );
    const version = (previousAgreement?.version || 0) + 1;
    const policy = independentPublishedPolicy(b, rows);
    await stopIndependentCollection(
      tx,
      team.id,
      player.id,
      actor.userId,
      "New accepted terms require separate payer authorization",
    );
    player.feeLock = {
      amount: total(rows) / 100,
      lockedAt: player.feeLock?.lockedAt || now,
      policyVersion: `independent-${b.independent!.seasonKey}-${version}`,
      components: { season: total(rows) / 100 },
    };
    player.planLock = {
      dep: (rows.find((r) => r.kind === "uniform")?.amount || 0) / 100,
      deadline: b.independent!.lastDue,
      planType: "custom",
      rows: rows.map((r) => ({ date: r.due, amount: r.amount / 100, label: r.label })),
    };
    player.agreement = {
      version: player.feeLock.policyVersion,
      signedBy: input.name,
      signedAt: now,
    };
    player.depositPaid = received(player) >= player.planLock.dep * 100;
    plan.players[player.id] = {
      ...old,
      status: old?.status || "Confirmed",
      note: "Guardian accepted per-player Prospects terms. Autopay requires separate authorization.",
      acceptedPolicy: policy,
      acceptedExplanation: b.parentExplanation ? structuredClone(b.parentExplanation) : undefined,
      automaticPayments: true,
      acceptedFeeCents: total(rows),
      acceptedSchedule: rows.map((r) => ({ date: r.due, amountCents: r.amount })),
      organizationAllocation: 0,
      membershipAllocation: rows
        .filter((r) => r.kind === "monthly")
        .reduce((s, r) => s + r.base, 0),
      contingencyAllocation: 0,
      serviceStart: b.independent!.firstDue,
      serviceEnd: b.independent!.seasonEnd,
      latePolicy: { fee: 0, grace: b.graceDays, hold: b.holdDays, removal: b.removalDays },
      independent: {
        ...previousAgreement,
        seasonKey: b.independent!.seasonKey,
        payerUserId: actor.userId,
        version,
        installments: rows,
        agreements: [
          ...(previousAgreement?.agreements || []),
          {
            version,
            publicationRevision: offer?.revision || plan.published.revision,
            actorId: actor.userId,
            name: input.name,
            at: now,
            policy,
            explanation: b.parentExplanation ? structuredClone(b.parentExplanation) : undefined,
            installments: structuredClone(rows),
          },
        ],
        offer: undefined,
      },
    };
  } else if (input.action === "independentUniform") {
    const independent = plan.players[input.playerId]?.independent;
    if (!independent?.agreements.length)
      throw Error("An accepted initial-deposit agreement is required.");
    independent.uniformCommitted = { at: now, reference: input.reference, actorId: actor.userId };
  } else if (input.action === "independentWithdraw" || input.action === "independentSeasonCancel") {
    const players =
      input.action === "independentWithdraw"
        ? team.roster.filter((p) => p.id === input.playerId)
        : team.roster;
    if (!players.length && input.action === "independentWithdraw") throw Error("Player not found.");
    for (const player of players) {
      await stopIndependentCollection(tx, team.id, player.id, actor.userId, input.reason);
      const old = plan.players[player.id] || { status: "Invited" as const, note: "" };
      const independent = old.independent || {
        seasonKey: plan.budget.independent!.seasonKey,
        payerUserId: "",
        version: 0,
        installments: [],
        agreements: [],
      };
      if (independent.cancellation) continue;
      independent.cancellation = {
        at: now,
        reason: input.reason,
        actorId: actor.userId,
        originalTotal: total(independent.installments),
      };
      // Prior cash remains cash; future paid amounts are credits for explicit refund
      // review, never a new vendor-cost assessment or silently erased history.
      independent.installments = independent.installments.map((r) =>
        r.due <= today || (r.kind === "uniform" && independent.uniformCommitted)
          ? r
          : { ...r, amount: 0, base: 0, processing: 0 },
      );
      independent.offer = undefined;
      plan.players[player.id] = {
        ...old,
        independent,
        acceptedFeeCents: total(independent.installments),
        acceptedSchedule: independent.installments.map((r) => ({
          date: r.due,
          amountCents: r.amount,
        })),
      };
      if (player.feeLock && player.planLock) {
        player.feeLock.amount = total(independent.installments) / 100;
        player.planLock.rows = independent.installments.map((r) => ({
          date: r.due,
          amount: r.amount / 100,
          label: r.label,
        }));
        player.planLock.dep =
          (independent.installments.find((r) => r.kind === "uniform")?.amount || 0) / 100;
      }
    }
    if (input.action === "independentSeasonCancel")
      plan.independentCancellation = { at: now, reason: input.reason, actorId: actor.userId };
  } else if (input.action !== "save" && input.action !== "independentAdminBudget") {
    throw Error(
      "Use the independent billing controls. Legacy budget defaults, fees and approval actions do not apply.",
    );
  }
  if (actor.owner && plan.budget.independent) {
    await tx`insert into independent_team_spaces(id,team_id,payload) values(${plan.budget.independent.seasonKey},${team.id},${JSON.stringify({ categories: [], policy: "", instructions: "", shared: false, closed: false })}::jsonb) on conflict(id) do nothing`;
    const [space] = await tx<{
      team_id: string;
    }>`select team_id from independent_team_spaces where id=${plan.budget.independent.seasonKey}`;
    if (space.team_id !== team.id)
      throw Error("Independent season identity already belongs to another team.");
  }
  plan.revision++;
  await auditFeeExplanation(
    tx,
    actor.userId,
    team.id,
    input.action,
    previous?.budget.parentExplanation,
    input.action === "independentOffer"
      ? input.budget.parentExplanation
      : plan.budget.parentExplanation,
    plan.revision,
    "playerId" in input ? input.playerId : undefined,
  );
  plan.history = [
    ...plan.history,
    {
      at: now,
      actor: actor.currentName,
      action: input.action + ("reason" in input ? ": " + input.reason : ""),
    },
  ];
  await commitFinancialFeePlanInTransaction(tx, context, {
    request: input,
    expectedBasisVersion: input.basisVersion,
    team,
    plan: JSON.parse(JSON.stringify(plan)) as FeePlan,
  });
}
