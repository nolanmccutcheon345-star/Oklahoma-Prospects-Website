/** Approved launch prices in cents. Catalog migrations and public displays use this module. */
export const PRICES = {
  individual: 5000, team: 6000, field: 7500,
  prospect: 7900, "all-star": 13900, "elite-family": 19900,
  m1: 22900, m2: 38900, m3: 44900, m4: 15900, m5: 17900,
  p1: 22000, p2: 37000, p3: 72000,
  s1: 14900, s2: 6000, s3: 10000, s4: 12900, s5: 4500, s6: 15900,
  s7: 6000, s8: 10000, s9: 15000, s10: 6000, s11: 10000, s12: 10000,
} as const;
export const ASSESSMENT_PRODUCTS = new Set<string>(["s1", "s4", "s9"]);
export const FIRST_MONTH_SETUP_CENTS = 5000;
export function dollars(id: keyof typeof PRICES) { return PRICES[id] / 100; }
export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
export function eligibility(kind: string, id: string, assessmentCompleted: boolean) {
  const assessment = ASSESSMENT_PRODUCTS.has(id);
  const recurring = kind === "membership" || id === "s6";
  const locked = !assessmentCompleted && !assessment && !recurring && (kind === "lesson" || kind === "package");
  return { locked, assessment, setupCents: recurring && !assessmentCompleted ? FIRST_MONTH_SETUP_CENTS : 0 };
}
export function refundCents(paidCents: number, startsAt: Date, now = new Date()) {
  if (!Number.isSafeInteger(paidCents) || paidCents < 0 || !Number.isFinite(startsAt.getTime())) throw new Error("Invalid refund.");
  const hours = (startsAt.getTime() - now.getTime()) / 3_600_000;
  return hours >= 48 ? paidCents : hours >= 24 ? Math.round(paidCents / 2) : 0;
}
