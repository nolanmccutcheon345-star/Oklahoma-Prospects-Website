// Read compatibility for saved financial snapshots only. These fields cannot be
// submitted through the current pricing or fee-acceptance schemas.
export function withoutRetiredMembershipPricing<T extends object>(value: T): T {
  const clean = { ...value } as Record<string, unknown>;
  delete clean.individualAccessMonthly;
  delete clean.standaloneAccessMonthly;
  if (Array.isArray(clean.rows))
    clean.rows = clean.rows.map((row) => withoutRetiredMembershipPricing(row));
  return clean as T;
}

export const separateMembershipPolicy =
  "Personal memberships are purchased separately through the Memberships page at the full published price. Team fees do not include a discounted personal membership.";

/** Current offers omit retired choices; original acceptedPolicy and locks stay intact. */
export function currentMembershipOffer<T extends { policy: string; schedules?: object }>(
  offer: T,
): T {
  const clean = { ...offer } as T & Record<string, unknown>;
  delete clean.fullAccess;
  delete clean.individualAccessMonthly;
  delete clean.billableMonths;
  if (offer.schedules) {
    const schedules = { ...offer.schedules } as Record<string, unknown>;
    delete schedules.fullAccess;
    clean.schedules = schedules;
  }
  // Explicit coverage snapshots are newly authored terms, not legacy template copy.
  // Never rewrite an admin's parent explanation or the matching acceptance policy.
  if (!("explanation" in offer && offer.explanation))
    clean.policy = offer.policy.replace(
      /Individual facility access is optional\./gi,
      separateMembershipPolicy,
    );
  return clean;
}
