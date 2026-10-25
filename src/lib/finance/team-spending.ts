import { z } from "zod";
import type { Payable, RecordRow } from "./contracts";
export const spendingCategories = [
  "coach",
  "tournament",
  "uniform",
  "hotel",
  "gas",
  "facility",
  "other",
] as const;
export type SpendingCategory = (typeof spendingCategories)[number];
const amount = z.number().int().min(0).max(1_000_000_000);
export const teamFundingReviewInput = z
  .object({
    teamId: z.string().min(1).max(150),
    availableCents: amount,
    limits: z
      .object({
        coach: amount,
        tournament: amount,
        uniform: amount,
        hotel: amount,
        gas: amount,
        facility: amount,
        other: amount,
      })
      .strict(),
    evidence: z
      .string()
      .trim()
      .min(20)
      .max(1500)
      .refine(
        (s) => !/(?:\d[ -]?){9,}/.test(s),
        "Use masked statement and settlement references, never full account/card numbers.",
      ),
    formationVerified: z.literal(true),
    protectedFundsVerified: z.literal(true),
  })
  .strict();
export type TeamFundingReview = z.infer<typeof teamFundingReviewInput> & {
  asOf: string;
  actor: string;
  evidenceKey: string;
  approvedAtReview: Record<string, number>;
  reservedSinceReview?: number;
};
export function spendingCategory(category: string): SpendingCategory {
  return spendingCategories.includes(category as SpendingCategory)
    ? (category as SpendingCategory)
    : "other";
}
export function teamBudgetUsage(records: RecordRow[], teamId: string) {
  const limits = Object.fromEntries(spendingCategories.map((c) => [c, 0])) as Record<
    SpendingCategory,
    number
  >;
  for (const { payload: p } of records.filter(
    (r) =>
      r.kind === "payable" &&
      r.payload.teamId === teamId &&
      r.payload.state !== "canceled" &&
      !["refund", "owner"].includes(r.payload.category),
  ))
    limits[spendingCategory(p.category)] += p.amount;
  return limits;
}
export function remainingTeamApprovalCash(review: TeamFundingReview, records: RecordRow[]) {
  // Consumption is monotonic until a new evidence-backed owner review.
  // Editing or canceling a payable does not silently replenish certified cash.
  void records;
  return Math.max(0, review.availableCents - (review.reservedSinceReview || 0));
}
export function assertTeamApproval(
  review: TeamFundingReview | undefined,
  records: RecordRow[],
  payable: Payable,
  asOf: string,
  evidenceKey: string,
) {
  if (!review || review.asOf !== asOf || review.evidenceKey !== evidenceKey)
    throw Error(
      "Complete today's team funding review in Team spending before approving this expense. Changed roster, payments or bank evidence requires a new review.",
    );
  const usage = teamBudgetUsage(records, payable.teamId);
  for (const category of spendingCategories)
    if (usage[category] > review.limits[category])
      throw Error(
        `Team ${category} commitments exceed the preseason allocation. Reduce or cancel unapproved requests; do not borrow from another team.`,
      );
  if (Math.max(0, payable.earned - payable.approved) > remainingTeamApprovalCash(review, records))
    throw Error(
      "This commitment exceeds this team's reviewed available settled cash. Wait for its own player fees to settle and reconcile.",
    );
}
