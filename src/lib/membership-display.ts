/** Public cage-pass highlight. Owner decision (Nov 2 2026): All-Star is the featured tier. */
export const FEATURED_CAGE_PLAN_ID = "all-star";

export function cagePlanIsHighlighted(
  plan: { id: string; featured: boolean },
  plans: readonly { featured: boolean }[],
): boolean {
  if (plans.some((item) => item.featured)) return plan.featured;
  return plan.id === FEATURED_CAGE_PLAN_ID;
}
