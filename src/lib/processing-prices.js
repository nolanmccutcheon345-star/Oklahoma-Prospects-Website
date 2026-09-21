/** Budget standard card processing into a uniformly displayed price, in cents.
 * 2.9% + 30 cents per planned payment. This is not a payment-method surcharge.
 * Zero-cost items stay free. Only new offers use this function; paid and agreed
 * amounts remain stored snapshots. Processor fees can differ from this budget.
 */
export function processingInclusiveCents(netCents, stepCents = 1, payments = 1) {
  if (!Number.isSafeInteger(netCents) || netCents < 0 || !Number.isSafeInteger(stepCents) || stepCents < 1 || !Number.isSafeInteger(payments) || payments < 1) throw new Error("Invalid price budget.");
  if (netCents === 0) return 0;
  return Math.ceil(((netCents + 30 * payments) * 1000) / (971 * stepCents)) * stepCents;
}
