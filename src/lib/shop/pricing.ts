export type PricingMode = "default" | "markup" | "margin" | "fixed";
export type PriceVariant = {
  priceCents: number;
  vendorCostCents?: number;
  costOverrideCents?: number | null;
  priceOverrideCents?: number | null;
};
export function priceVariant(v: PriceVariant, mode: PricingMode, bps: number, defaultBps: number) {
  const cost = v.costOverrideCents ?? v.vendorCostCents;
  const override = v.priceOverrideCents;
  if (override != null) return validPrice(override);
  if (mode === "fixed") return validPrice(v.priceCents);
  if (!Number.isSafeInteger(cost) || cost! <= 0)
    throw new Error("Vendor cost is missing. Sync costs or set a pricing cost override.");
  const rate = mode === "default" ? defaultBps : bps;
  if (
    !Number.isSafeInteger(rate) ||
    rate < 0 ||
    rate > 100000 ||
    (mode === "margin" && rate >= 9500)
  )
    throw new Error("Use a valid markup or a gross margin below 95%.");
  return validPrice(
    Math.ceil(
      mode === "margin" ? (cost! * 10000) / (10000 - rate) : (cost! * (10000 + rate)) / 10000,
    ),
  );
}
function validPrice(value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 250000)
    throw new Error("Retail price must be between $0.01 and $2,500.");
  return value;
}
export function priceMetrics(cost: number | undefined, price: number) {
  return cost && price > 0
    ? {
        markup: (price / cost - 1) * 100,
        margin: ((price - cost) / price) * 100,
        contribution: price - cost,
      }
    : null;
}
