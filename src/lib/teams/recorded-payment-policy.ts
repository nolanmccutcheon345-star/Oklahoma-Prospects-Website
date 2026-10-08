import type { Player } from "./types";

type RecordablePlayer = Pick<Player, "feeLock" | "payments" | "credits">;

function cents(amount: number, label: string): number {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)))
    throw new Error(`Invalid ${label} amount.`);
  const rounded = Math.round(amount * 100);
  if (Math.abs(amount * 100 - rounded) > 1e-6)
    throw new Error(`Invalid ${label} amount: use dollars and cents.`);
  return rounded;
}

/** An office entry is a ledger record, not evidence of an external provider charge. */
export function remainingTeamPaymentCents(player: RecordablePlayer): number {
  if (!player.feeLock || player.feeLock.amount <= 0)
    throw new Error("A signed, positive player fee is required before recording payment.");
  const signed = cents(player.feeLock.amount, "signed fee");
  const paid = (player.payments || []).reduce((sum, row) => sum + cents(row.amount, "past payment"), 0);
  const credits = (player.credits || []).reduce((sum, row) => sum + cents(row.amount, "credit"), 0);
  return Math.max(0, signed - paid - credits);
}

export function assertRecordableTeamPayment(player: RecordablePlayer, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Enter a payment amount greater than zero.");
  const requested = cents(amount, "new payment");
  const available = remainingTeamPaymentCents(player);
  if (available === 0)
    throw new Error("No balance remains to record another payment.");
  if (requested > available)
    throw new Error(`Payment exceeds the outstanding balance ($${(available / 100).toFixed(2)}).`);
  return available;
}
