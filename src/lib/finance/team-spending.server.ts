import { createHash } from "node:crypto";
import type { FinancialContext } from "./context.server";
import type { RecordRow } from "./contracts";
import { calculateFees } from "../teams/fee-model";
import { minimumCommittedRoster } from "../teams/operating-policy";
import { teamBudgetLedger } from "./team-budget";
import {
  remainingTeamApprovalCash,
  teamBudgetUsage,
  type TeamFundingReview,
} from "./team-spending";

export function teamSpendingContext(
  context: FinancialContext,
  records: RecordRow[],
  teamId: string,
) {
  const team = context.club.teams.find((t) => t.id === teamId);
  const plan = context.feePlans.find((p) => p.team_id === teamId)?.payload;
  if (!team) throw Error("Financial team not found.");
  const roster = team.roster.filter(
    (p) => !p.withdrawn && plan?.players[p.id]?.status !== "Removed",
  );
  const committed = roster.filter(
    (p) =>
      p.feeLock &&
      p.planLock &&
      p.agreement.signedAt &&
      Math.round(
        (p.payments.reduce((n, x) => n + x.amount, 0) +
          p.credits.reduce((n, x) => n + x.amount, 0)) *
          100,
      ) >= Math.round(p.planLock.dep * 100),
  ).length;
  const budget = plan?.spendingBudget?.budget || plan?.publishedBudget;
  const f = budget ? calculateFees(budget) : null;
  // Budget ceiling is frozen by the first owner review; later draft budgets cannot increase it.
  const evidenceKey = createHash("sha256")
    .update(
      JSON.stringify({
        teamId,
        roster: roster.map((p) => ({
          id: p.id,
          fee: p.feeLock,
          schedule: p.planLock,
          agreement: p.agreement,
          payments: p.payments,
          credits: p.credits,
        })),
        publishedBudget: budget,
        allocations: records.filter(
          (r) =>
            ["teamBudgetTransfer", "budgetAssignment"].includes(r.kind) &&
            r.payload.teamId === teamId,
        ),
        closed: team.closed || plan?.status === "closed",
        bank: records.filter((r) => ["bank", "account", "settlement", "payment"].includes(r.kind)),
      }),
    )
    .digest("hex");
  return {
    teamId,
    name: team.name,
    roster: roster.length,
    committed,
    recordedFundingCents:
      Math.round(
        team.roster.reduce((n, p) => n + p.payments.reduce((a, x) => a + x.amount, 0), 0) * 100,
      ) +
      records
        .filter((r) => r.kind === "fundraisingCredit" && r.payload.teamId === teamId)
        .reduce((n, r) => n + r.payload.cents, 0),
    formationReady: roster.length >= minimumCommittedRoster && committed === roster.length,
    published: Boolean(f),
    closed: Boolean(team.closed || plan?.status === "closed"),
    ceiling: f ? f.externalDirect + f.contingency : 0,
    evidenceKey,
  };
}
export function teamSpendingViews(context: FinancialContext, records: RecordRow[], asOf: string) {
  return context.club.teams.map((team) => {
    const state = teamSpendingContext(context, records, team.id);
    const review = records.find(
      (r) => r.kind === "teamFundingReview" && r.payload.teamId === team.id,
    )?.payload as TeamFundingReview | undefined;
    return {
      ...state,
      ledger: teamBudgetLedger(
        context.feePlans.find((p) => p.team_id === team.id)?.payload,
        records,
        team.id,
      ),
      usage: teamBudgetUsage(records, team.id),
      review: review || null,
      current: Boolean(review && review.asOf === asOf && review.evidenceKey === state.evidenceKey),
      remaining: review ? remainingTeamApprovalCash(review, records) : 0,
    };
  });
}
