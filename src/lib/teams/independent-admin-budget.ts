import { z } from "zod";
import { independentSchedule, type IndependentBudget } from "./independent-model";

const cents = z.number().int().min(0).max(100_000_000);
const cost = cents.nullable();
const depositPlanningSchema = z
  .object({
    basisPlayers: z.number().int().min(1).max(200),
    expectedPlayers: z.number().int().min(0).max(200),
    uniformPerPlayer: cost,
    organizationPerPlayer: cents,
    expenses: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            name: z.string().trim().min(1).max(100),
            total: cost,
            included: z.boolean(),
          })
          .strict(),
      )
      .max(25)
      .refine(
        (rows) => new Set(rows.map((r) => r.id)).size === rows.length,
        "Expense IDs must be unique.",
      ),
  })
  .strict();
export const independentAdminBudgetSchema = z
  .object({
    depositNote: z.string().trim().max(2000),
    // Preserve old team-total inputs for history. New planning uses explicit units below.
    uniforms: cost,
    coaching: cost,
    coachTravel: cost,
    planning: depositPlanningSchema.optional(),
  })
  .strict();
export type IndependentAdminBudget = z.infer<typeof independentAdminBudgetSchema>;
export type IndependentDepositPlanning = z.infer<typeof depositPlanningSchema>;
export const emptyIndependentAdminBudget = (): IndependentAdminBudget => ({
  depositNote: "",
  uniforms: null,
  coaching: null,
  coachTravel: null,
});
export function withIndependentPlanning(
  costs: IndependentAdminBudget,
): IndependentAdminBudget & { planning: IndependentDepositPlanning } {
  return {
    ...costs,
    planning: costs.planning || {
      basisPlayers: 10,
      expectedPlayers: 10,
      uniformPerPlayer: null,
      organizationPerPlayer: 0,
      expenses: [
        { id: "coaching", name: "Coaching pay", total: costs.coaching, included: true },
        { id: "coach-travel", name: "Coach travel", total: costs.coachTravel, included: true },
        { id: "tournaments", name: "Tournament fees", total: null, included: false },
      ],
    },
  };
}
const validAmount = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validPlayers = (n: number, minimum: number) =>
  Number.isInteger(n) && n >= minimum && n <= 200;

export function independentCostTotals(costs: IndependentAdminBudget, playerCount?: number) {
  const p = costs.planning;
  if (!p)
    return {
      uniforms: costs.uniforms,
      costsComplete: [costs.uniforms, costs.coaching, costs.coachTravel].every(validAmount),
      totalCosts: (costs.uniforms ?? 0) + (costs.coaching ?? 0) + (costs.coachTravel ?? 0),
    };
  const selected = p.expenses.filter((e) => e.included);
  const players = playerCount ?? p.expectedPlayers;
  const uniforms =
    validAmount(p.uniformPerPlayer) && validPlayers(players, 0)
      ? p.uniformPerPlayer * players
      : null;
  return {
    uniforms,
    costsComplete: uniforms !== null && selected.every((e) => validAmount(e.total)),
    totalCosts: (uniforms ?? 0) + selected.reduce((sum, e) => sum + (e.total ?? 0), 0),
  };
}

/** Pricing basis and expected roster are private planning inputs, never obligations. */
export function independentBudgetProjection(
  budget: IndependentBudget,
  costs: IndependentAdminBudget,
) {
  const p = withIndependentPlanning(costs).planning;
  const basisPlayers = validPlayers(p.basisPlayers, 1) ? p.basisPlayers : null;
  const expectedPlayers = validPlayers(p.expectedPlayers, 0) ? p.expectedPlayers : null;
  const uniformPerPlayer = validAmount(p.uniformPerPlayer) ? p.uniformPerPlayer : null;
  const selected = p.expenses.filter((e) => e.included);
  const fixedCosts = selected.every((e) => validAmount(e.total))
    ? selected.reduce((sum, e) => sum + e.total!, 0)
    : null;
  const costCoveredDeposit =
    uniformPerPlayer !== null && fixedCosts !== null && basisPlayers !== null
      ? uniformPerPlayer + Math.ceil(fixedCosts / basisPlayers)
      : null;
  const calculatedDeposit =
    costCoveredDeposit !== null && validAmount(p.organizationPerPlayer)
      ? costCoveredDeposit + p.organizationPerPlayer
      : null;
  const deposit = validAmount(budget.independent?.uniformDeposit)
    ? budget.independent!.uniformDeposit
    : null;
  const monthly = validAmount(budget.independent?.monthlyDues)
    ? budget.independent!.monthlyDues
    : null;
  let monthlyInstallments: number | null = null,
    processingPerPlayer: number | null = null;
  try {
    const schedule = independentSchedule(budget);
    if (schedule.length) {
      monthlyInstallments = schedule.filter((r) => r.kind === "monthly").length;
      processingPerPlayer = schedule.reduce((sum, r) => sum + r.processing, 0);
    }
  } catch {
    /* Drafts with incomplete dates do not invent a billing term. */
  }
  const scenario = (players: number | null) => {
    const initialDeposits = players !== null && deposit !== null ? players * deposit : null;
    const uniforms =
      players !== null && uniformPerPlayer !== null ? players * uniformPerPlayer : null;
    const totalCosts = uniforms !== null && fixedCosts !== null ? uniforms + fixedCosts : null;
    const monthlyRevenue = players !== null && monthly !== null ? players * monthly : null;
    const seasonMonthlyRevenue =
      monthlyRevenue !== null && monthlyInstallments !== null
        ? monthlyRevenue * monthlyInstallments
        : null;
    const seasonRevenue =
      initialDeposits !== null && seasonMonthlyRevenue !== null
        ? initialDeposits + seasonMonthlyRevenue
        : null;
    return {
      players,
      initialDeposits,
      uniforms,
      totalCosts,
      monthlyRevenue,
      seasonMonthlyRevenue,
      seasonRevenue,
      depositProfit:
        initialDeposits !== null && totalCosts !== null ? initialDeposits - totalCosts : null,
      seasonProfit:
        seasonRevenue !== null && totalCosts !== null ? seasonRevenue - totalCosts : null,
      processingAllowance:
        players !== null && processingPerPlayer !== null ? players * processingPerPlayer : null,
    };
  };
  const additionalPlayerContribution =
    deposit !== null && uniformPerPlayer !== null ? deposit - uniformPerPlayer : null;
  return {
    basisPlayers,
    expectedPlayers,
    uniformPerPlayer,
    fixedCosts,
    costCoveredDeposit,
    calculatedDeposit,
    monthlyInstallments,
    additionalPlayerContribution,
    breakEvenPlayers:
      fixedCosts === 0
        ? 0
        : fixedCosts !== null &&
            additionalPlayerContribution !== null &&
            additionalPlayerContribution > 0
          ? Math.ceil(fixedCosts / additionalPlayerContribution)
          : null,
    baseline: scenario(basisPlayers),
    expected: scenario(expectedPlayers),
  };
}

/** A private worksheet; these cumulative cost inputs never post accounting entries. */
export function independentProfitWorksheet(input: {
  costs: IndependentAdminBudget;
  initialDeposits: number;
  monthlyDues: number;
  disclosedProcessing: number;
  credits: number;
  acceptedPlayers: number;
  pendingPlayers: number;
  recordedPayments: number;
  appliedPayments: number;
  squareGross: number;
  squareRefunds: number;
  verifiedOffline?: number;
  knownProcessingFees: number;
  missingProcessingFees: number;
}) {
  const { costsComplete, totalCosts } = independentCostTotals(input.costs, input.acceptedPlayers);
  const projectedCosts = independentCostTotals(
    input.costs,
    input.acceptedPlayers + input.pendingPlayers,
  );
  const verifiedOffline = input.verifiedOffline || 0;
  const netCollected = Math.max(0, input.squareGross - input.squareRefunds) + verifiedOffline;
  const appliedRevenue = Math.min(netCollected, Math.max(0, input.appliedPayments));
  const projectedRevenue = Math.max(
    0,
    input.initialDeposits + input.monthlyDues + input.disclosedProcessing - input.credits,
  );
  const needsReconciliation = netCollected !== input.recordedPayments;
  return {
    initialDeposits: input.initialDeposits,
    monthlyDues: input.monthlyDues,
    disclosedProcessing: input.disclosedProcessing,
    credits: input.credits,
    acceptedPlayers: input.acceptedPlayers,
    pendingPlayers: input.pendingPlayers,
    grossCollected: input.squareGross,
    verifiedOffline,
    refunded: input.squareRefunds,
    netCollected,
    appliedRevenue,
    reservedOrUnreconciled: netCollected - appliedRevenue,
    processingFees: input.knownProcessingFees,
    missingProcessingFees: input.missingProcessingFees,
    needsReconciliation,
    totalCosts,
    costsComplete,
    projectedCosts: projectedCosts.costsComplete ? projectedCosts.totalCosts : null,
    projectedRevenue,
    projectedMarginBeforeProcessing: projectedCosts.costsComplete
      ? projectedRevenue - projectedCosts.totalCosts
      : null,
    collectedMargin:
      costsComplete && !needsReconciliation && !input.missingProcessingFees
        ? appliedRevenue - totalCosts - input.knownProcessingFees
        : null,
  };
}
