import { processingInclusiveCents } from "./processing-prices.js";
/** Net targets retained for budgeting. Never expose these as the checkout price. */
export const NET_PRICES = {
  individual: 5000, team: 6000, field: 7500,
  prospect: 7900, "all-star": 13900, "elite-family": 19900,
  m1: 23900, m2: 38900, m3: 44900, m4: 15900, m5: 17900,
  p1: 22000, p2: 38500, p3: 74000,
  s1: 14900, s2: 6000, s3: 10000, s4: 12900, s5: 4500, s6: 15900,
  s7: 6000, s8: 10000, s9: 15000, s10: 6000, s11: 10000, s12: 10000,
} as const;
/** Posted prices include processing for all methods; no checkout surcharge.
 * Rental rates cover the minimum 30-minute unit; other products round to dollars. */
export const PRICES = Object.fromEntries(Object.entries(NET_PRICES).map(([id, net]) => [
  id, ["individual", "team", "field"].includes(id)
    ? processingInclusiveCents(net / 2, 25) * 2
    : processingInclusiveCents(net, 100),
])) as Record<keyof typeof NET_PRICES, number>;
export const ASSESSMENT_PRODUCTS = new Set<string>(["s1", "s4", "s9"]);
export const FIRST_MONTH_SETUP_CENTS = processingInclusiveCents(5000, 100);
export function dollars(id: keyof typeof PRICES) { return PRICES[id] / 100; }
/** Apply current catalog defaults without changing saved bookings or payments. */
export function currentCatalogPrice<T extends { id: string; price: number }>(item: T): T {
  const cents = PRICES[item.id as keyof typeof PRICES];
  return cents === undefined ? item : { ...item, price: cents / 100 };
}
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
