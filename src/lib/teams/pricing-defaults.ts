import { z } from "zod";
import {
  programDraft,
  eventPaymentSchema,
  pricingKeys,
  type FeeBudget,
  type PricingKey,
} from "./fee-model";
import { matchMatrix, rowKey, type MasterMatrix } from "./budget-matrix";
import type { FeePlan } from "./fee-contracts";
import type { Team } from "./types";

export const pricingReleaseSchema = z
  .object({
    membershipMonthly: z.number().int().min(0).max(1000000000),
    poMembershipMonthly: z.number().int().min(0).max(1000000000),
    contingencyBps: z.number().int().min(0).max(10000),
    eventPaymentSchedule: eventPaymentSchema,
  })
  .strict();
// Forward interpretation applies only to working defaults, never to historical
// published budgets or accepted locks. Subsequent owner saves persist config.
export function releasedMaster(master: MasterMatrix, release: unknown): MasterMatrix {
  if (master.pricingDefaultsVersion === 1) return master;
  return {
    ...master,
    ...pricingReleaseSchema.parse(release),
    pricingDefaultsVersion: 1,
    pricingPrevious: {
      membershipMonthly: master.membershipMonthly,
      poMembershipMonthly: master.poMembershipMonthly ?? master.membershipMonthly,
      contingencyBps: master.contingencyBps,
    },
  };
}
export function teamPricingValues(
  master: MasterMatrix,
  plan: FeePlan,
  team?: Pick<Team, "age" | "sport" | "seasonLabel" | "seasons">,
) {
  const row =
    master.rows.find((r) => rowKey(r) === plan.defaults?.key) ||
    (team ? matchMatrix(team, master) : undefined);
  return {
    membershipMonthly: row?.membershipMonthly ?? master.membershipMonthly,
    poMembershipMonthly:
      row?.poMembershipMonthly ?? master.poMembershipMonthly ?? master.membershipMonthly,
    contingencyBps: row?.contingencyBps ?? master.contingencyBps,
    eventPaymentSchedule: master.eventPaymentSchedule,
  };
}
export function linkedPricingDraft(plan: FeePlan, master: MasterMatrix, team: Team): FeeBudget {
  if (plan.status === "closed" || !master.pricingDefaultsVersion) return plan.budget;
  const b = programDraft(plan.budget);
  let inheritance = b.pricingInheritance;
  if (!inheritance) {
    const row = master.rows.find((r) => rowKey(r) === plan.defaults?.key);
    const before = master.pricingPrevious;
    const known = Boolean(plan.defaults && row && before);
    const overrides: PricingKey[] = [];
    for (const key of pricingKeys) {
      if (key === "eventPaymentSchedule") {
        if (
          !known ||
          b.paymentSchedule ||
          b.secondDue ||
          b.deadlineOverride ||
          b.triggerEventId ||
          b.daysBeforeTournament !== 28
        )
          overrides.push(key);
      } else if (!known || b[key] !== (row?.[key] ?? before?.[key])) overrides.push(key);
    }
    inheritance = { version: 1, overrides, ...(!known ? { legacyReview: true } : {}) };
  }
  const values = teamPricingValues(master, plan, team);
  return {
    ...b,
    ...Object.fromEntries(
      pricingKeys.filter((k) => !inheritance.overrides.includes(k)).map((k) => [k, values[k]]),
    ),
    pricingInheritance: inheritance,
  };
}
export function patchPricingDraft(b: FeeBudget, patch: Partial<FeeBudget>): FeeBudget {
  if (!b.pricingInheritance || patch.pricingInheritance) return { ...b, ...patch };
  const changed = pricingKeys.filter((k) => k in patch);
  if (
    [
      "paymentSchedule",
      "secondDue",
      "deadlineOverride",
      "daysBeforeTournament",
      "triggerEventId",
    ].some((k) => k in patch)
  )
    changed.push("eventPaymentSchedule");
  return {
    ...b,
    ...patch,
    pricingInheritance: {
      ...b.pricingInheritance,
      overrides: [...new Set([...b.pricingInheritance.overrides, ...changed])],
    },
  };
}
export function pricingRevisionNeeded(plan: FeePlan, draft: FeeBudget, final: string) {
  if (!plan.published) return false;
  const prior = plan.publishedBudget || plan.budget;
  return (
    pricingKeys.some((k) => JSON.stringify(prior[k]) !== JSON.stringify(draft[k])) ||
    (Boolean(draft.eventPaymentSchedule) &&
      (plan.published.finalDue !== final || prior.start !== draft.start || prior.end !== draft.end))
  );
}
