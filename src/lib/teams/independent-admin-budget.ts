import { z } from "zod";

const cost = z.number().int().min(0).max(100_000_000).nullable();
export const independentAdminBudgetSchema = z
  .object({
    depositNote: z.string().trim().max(2000),
    uniforms: cost,
    coaching: cost,
    coachTravel: cost,
  })
  .strict();
export type IndependentAdminBudget = z.infer<typeof independentAdminBudgetSchema>;
export const emptyIndependentAdminBudget = (): IndependentAdminBudget => ({
  depositNote: "",
  uniforms: null,
  coaching: null,
  coachTravel: null,
});

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
  const costsComplete = [input.costs.uniforms, input.costs.coaching, input.costs.coachTravel].every(
    (v) => v !== null,
  );
  const totalCosts =
    (input.costs.uniforms || 0) + (input.costs.coaching || 0) + (input.costs.coachTravel || 0);
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
    projectedRevenue,
    projectedMarginBeforeProcessing: costsComplete ? projectedRevenue - totalCosts : null,
    collectedMargin:
      costsComplete && !needsReconciliation && !input.missingProcessingFees
        ? appliedRevenue - totalCosts - input.knownProcessingFees
        : null,
  };
}
