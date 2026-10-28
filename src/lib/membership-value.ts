/** Integer cents/minutes. A comparison never changes a quote or a credit grant. */
export function calculateMembershipValue(input: {
  monthlyPriceCents: number;
  monthlyMinutes: number;
  dropInRateCents: number;
  rateMinutes?: number;
  resourcesPerSession?: number;
}) {
  const {
    monthlyPriceCents,
    monthlyMinutes,
    dropInRateCents,
    rateMinutes = 60,
    resourcesPerSession = 1,
  } = input;
  if (
    ![monthlyPriceCents, monthlyMinutes, dropInRateCents, rateMinutes, resourcesPerSession].every(
      Number.isSafeInteger,
    ) ||
    monthlyPriceCents < 0 ||
    monthlyMinutes <= 0 ||
    dropInRateCents < 0 ||
    rateMinutes <= 0 ||
    resourcesPerSession <= 0
  )
    return null;
  const numerator = monthlyMinutes * resourcesPerSession * dropInRateCents;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(monthlyPriceCents * 60))
    return null;
  const dropInEquivalentCents = Math.round(numerator / rateMinutes);
  const savingsCents = dropInEquivalentCents - monthlyPriceCents;
  return {
    effectiveHourlyRateCents: Math.round((monthlyPriceCents * 60) / monthlyMinutes),
    dropInEquivalentCents,
    savingsCents,
    savingsPercent:
      dropInEquivalentCents > 0 ? Math.round((savingsCents * 100) / dropInEquivalentCents) : null,
  };
}

/** Cage credits are hours in the existing paid-order snapshot and fulfillment. */
export function cageIncludedMinutes(credits: number) {
  return Number.isSafeInteger(credits) && credits > 0 && Number.isSafeInteger(credits * 60)
    ? credits * 60
    : 0;
}
