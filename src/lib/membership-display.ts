/** Public cage-pass highlight. Only the stored admin `featured` flag turns it on. */
export function membershipFeatureAppearance(plan: { featured: boolean; badge?: string }): {
  featured: boolean;
  badge: string;
} {
  const custom = (plan.badge ?? "").trim();
  if (!plan.featured) return { featured: false, badge: "" };
  return { featured: true, badge: custom || "Featured" };
}
