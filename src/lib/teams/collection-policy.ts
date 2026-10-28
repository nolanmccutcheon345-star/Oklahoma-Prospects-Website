import { chicagoDate, chicagoInstant } from "../scheduling";
export type CollectionTerms = {
  version: 1;
  acceptedFeeCents: number;
  rows: { date: string; amountCents: number }[];
  graceDays: number;
  lateFeeBps: 0 | 2000;
  fundingModel?: "independent";
  agreementVersion?: number;
};
export const collectionConsent =
  "I authorize Prospects Sports Academy to store my primary and backup cards securely with Square and automatically collect each unpaid installment of this athlete's accepted fee on its due date, beginning at 9:00 a.m. America/Chicago. Already overdue installments may be collected after I activate this authorization. After a confirmed primary-card decline, the backup card may be attempted beginning at 9:00 a.m. the following calendar day. An uncertain payment result stops collection for review. Payments and approved credits reduce the amount collected. If both cards fail and the agreed grace period expires, a one-time late fee of 20% of that installment's unpaid overdue amount may be assessed after owner review; future installments and prior late fees are excluded. I can revoke future automatic charges in my account; revocation does not cancel the accepted fee or excuse missed payments. No processing surcharge is added at checkout.";
export function installmentRemaining(
  terms: CollectionTerms,
  receivedCents: number,
  fees: { cents: number; at: string }[] = [],
) {
  let available = Math.max(0, receivedCents);
  const rows = terms.rows.map((row, index) => ({ ...row, index, remainingCents: row.amountCents }));
  const schedule = [
    ...rows.map((r) => ({ date: r.date, amount: r.amountCents, index: r.index })),
    ...fees.map((f) => ({
      date: f.at.includes("T") ? chicagoDate(new Date(f.at)) : f.at.slice(0, 10),
      amount: f.cents,
      index: -1,
    })),
  ].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.index < 0 ? Number.MAX_SAFE_INTEGER : a.index) -
        (b.index < 0 ? Number.MAX_SAFE_INTEGER : b.index),
  );
  for (const row of schedule) {
    const applied = Math.min(row.amount, available);
    available -= applied;
    if (row.index >= 0) rows[row.index].remainingCents = row.amount - applied;
  }
  return rows;
}
export function collectionDueAt(date: string) {
  return chicagoInstant(date, "09:00");
}
export function backupDueAt(now: Date) {
  const date = new Date(chicagoDate(now) + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return collectionDueAt(date.toISOString().slice(0, 10));
}
export function installmentLateFee(remainingCents: number) {
  if (!Number.isSafeInteger(remainingCents) || remainingCents < 0)
    throw Error("Invalid overdue installment.");
  return Math.round((remainingCents * 2000) / 10000);
}
/** Only confirmed card declines allow another card. Transport/configuration/authentication errors require review. */
export function confirmedCollectionDecline(error: unknown): string | null {
  const value = error as { body?: { errors?: { code?: string }[] }; errors?: { code?: string }[] };
  const errors = value?.body?.errors || value?.errors || [];
  const allowed = new Set([
    "CARD_DECLINED",
    "GENERIC_DECLINE",
    "INSUFFICIENT_FUNDS",
    "CARD_EXPIRED",
    "EXPIRATION_FAILURE",
    "INVALID_EXPIRATION",
  ]);
  const codes = errors.map((e) => e.code || "");
  return codes.length > 0 && codes.every((c) => allowed.has(c)) ? codes.join(",") : null;
}
