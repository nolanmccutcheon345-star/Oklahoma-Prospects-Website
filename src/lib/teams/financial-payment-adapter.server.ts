/**
 * DORMANT, internal-only payment cutover primitives. No route imports this module.
 * These pure functions neither authenticate a request nor verify a Square event.
 * A future guarded transaction must load the saved basis, current account flags,
 * complete relevant order/attempt set, and LIVE verified provider ledger itself.
 * Never accept any of those values (including eligibility flags) from a browser.
 * No provider calls, database writer, operational fallback, or activation here.
 */
import type { SquareOrder } from "../commerce/square-payments.server";
import {
  hasFrozenFinancialGuardian,
  resolveFinancialAgreement,
  type FinancialBasis,
  type FinancialInputs,
} from "../finance/basis.server";
import { teamCheckoutSchema, type TeamCheckout, type TeamFeeSnapshot } from "./payment-contracts";
import { remainingTeamPaymentCents } from "./recorded-payment-policy";

/** Added only by the future server-side quote builder, never by checkout input. */
export type StableTeamFeeSnapshot = TeamFeeSnapshot & {
  financialAgreementId: string;
  financialTeamSeasonId: string;
};
type StoredTeamFeeSnapshot = TeamFeeSnapshot & Partial<StableTeamFeeSnapshot>;

/** Read fresh from the authenticated account in the same guarded transaction.
 * Financial role/household authority comes from the saved financial basis.
 * An operational profile role, contact email, or newly linked household grants
 * no financial authority. Account disablement/restriction remains immediate.
 */
export type CurrentFinancialPayerEligibility = {
  userId: string;
  emailVerified: boolean;
  disabledAt: Date | string | null;
  financialRestricted: boolean;
};

export type FinancialTeamOrder = SquareOrder & { request_key: string };
export type FinancialTeamPaymentAttempt = { order_id: string; status: string };
export type LiveSquareTeamPayment = {
  id: string;
  order_id: string;
  environment: string;
  status: string;
  amount_cents: number;
  refunded_cents: number;
  receipt_url: string | null;
};

function integerCents(value: number, label: string, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0))
    throw new Error(`Invalid ${label} amount.`);
  return value;
}

function time(value: Date | string, label: string) {
  const result = new Date(value).getTime();
  if (!Number.isFinite(result)) throw new Error(`Invalid ${label} time.`);
  return result;
}

function snapshot(order: SquareOrder): StoredTeamFeeSnapshot {
  const value = order.snapshot.teamFee;
  if (order.kind !== "team-fee" || order.snapshot.kind !== "team-fee" || !value)
    throw new Error("Team fee details are missing.");
  return value;
}

/** Resolve complete historical pairs, even when the operational player moved.
 * A stable reference is additive: it must never reinterpret a historical pair.
 */
export function resolveFinancialTeamPayment(basis: FinancialBasis, order: SquareOrder) {
  const m = snapshot(order);
  const aliases = basis.playerAliases.filter(
    (a) => a.teamId === m.teamId && a.playerId === m.playerId,
  );
  if (aliases.length !== 1) throw new Error("Financial payment alias is unavailable or ambiguous.");
  const resolved = resolveFinancialAgreement(basis, { teamId: m.teamId, playerId: m.playerId });
  if (
    (m.financialAgreementId !== undefined || m.financialTeamSeasonId !== undefined) &&
    (m.financialAgreementId !== resolved.identity.id ||
      m.financialTeamSeasonId !== resolved.identity.teamSeasonId)
  )
    throw new Error("Financial payment identity changed.");
  return resolved;
}

export function assertFinancialTeamPayer(
  basis: FinancialBasis,
  agreementId: string,
  payer: CurrentFinancialPayerEligibility,
) {
  if (
    !payer.userId ||
    payer.emailVerified !== true ||
    payer.disabledAt !== null ||
    payer.financialRestricted !== false
  )
    throw new Error("Current financial account access is unavailable.");
  if (!hasFrozenFinancialGuardian(basis, agreementId, payer.userId))
    throw new Error("Only this player’s financially authorized parent or guardian can pay.");
}

/** The caller must lock the financial version and query ALL relevant historical
 * aliases/stable IDs, in the same environment, before using this decision. The
 * pure array input alone cannot serialize two requests or prove completeness.
 */
export function blockingFinancialTeamPayment(
  basis: FinancialBasis,
  agreementId: string,
  environment: string,
  orders: readonly SquareOrder[],
  attempts: readonly FinancialTeamPaymentAttempt[],
  now: Date,
) {
  resolveFinancialAgreement(basis, { agreementId });
  const at = time(now, "checkout");
  const aliases = basis.playerAliases.filter((a) => a.agreementId === agreementId);
  return orders.find((order) => {
    if (order.kind !== "team-fee" || order.payment_environment !== environment) return false;
    const m = snapshot(order);
    if (
      m.financialAgreementId !== agreementId &&
      !aliases.some((a) => a.teamId === m.teamId && a.playerId === m.playerId)
    )
      return false;
    if (resolveFinancialTeamPayment(basis, order).identity.id !== agreementId)
      throw new Error("Financial payment identity changed.");
    // Uncertain charges must block even if a legacy recovery path expired the
    // order. Never permit a fresh charge merely because its hold has elapsed.
    return (
      order.status === "payment_review" ||
      (order.status === "pending" && time(order.hold_until, "checkout hold") > at) ||
      attempts.some((a) => a.order_id === order.id && ["pending", "unknown"].includes(a.status))
    );
  });
}

export function planFinancialTeamCheckout(
  basis: FinancialBasis,
  input: {
    request: TeamCheckout;
    payer: CurrentFinancialPayerEligibility;
    environment: string;
    orders: readonly FinancialTeamOrder[];
    attempts: readonly FinancialTeamPaymentAttempt[];
    now: Date;
  },
) {
  const a = teamCheckoutSchema.parse(input.request);
  const { identity, team, player } = resolveFinancialAgreement(basis, a);
  assertFinancialTeamPayer(basis, identity.id, input.payer);
  const at = time(input.now, "checkout");
  const matching = input.orders.filter((o) => o.request_key === a.requestId);
  if (matching.length > 1) throw new Error("Checkout request is ambiguous.");
  const prior = matching[0];
  if (prior) {
    if (
      prior.user_id !== input.payer.userId ||
      prior.snapshot.teamFee?.playerId !== a.playerId ||
      prior.snapshot.teamFee?.teamId !== a.teamId ||
      prior.total_cents !== a.amount ||
      prior.payment_environment !== input.environment ||
      resolveFinancialTeamPayment(basis, prior).identity.id !== identity.id
    )
      throw new Error("Checkout request changed.");
    if (prior.status !== "pending" || time(prior.hold_until, "checkout hold") <= at)
      throw new Error("Checkout ended. Review your payment history before trying again.");
    return { action: "reuse" as const, expectedVersion: basis.version, order: prior };
  }
  if (
    !player.agreement.signedAt ||
    !player.planLock ||
    !player.feeLock ||
    team.closed ||
    player.withdrawn
  )
    throw new Error(
      "Accept the published team fee before paying. Contact the office for a closed roster.",
    );
  if (a.amount > remainingTeamPaymentCents(player))
    throw new Error("Payment exceeds the remaining accepted fee. Refresh your balance.");
  if (
    blockingFinancialTeamPayment(
      basis,
      identity.id,
      input.environment,
      input.orders,
      input.attempts,
      input.now,
    )
  )
    throw new Error("A team payment is already awaiting completion or review.");
  const teamFee: StableTeamFeeSnapshot = {
    teamId: a.teamId,
    playerId: a.playerId,
    lockedAt: player.feeLock.lockedAt,
    role: player.roleType,
    financialAgreementId: identity.id,
    financialTeamSeasonId: identity.teamSeasonId,
  };
  const quote: SquareOrder["snapshot"] & { consentAt: string; teamFee: StableTeamFeeSnapshot } = {
    productId: team.id,
    kind: "team-fee",
    title: `${team.name} · ${player.name} · team fee`,
    totalCents: a.amount,
    regularCents: a.amount,
    setupCents: 0,
    recurring: false,
    assessment: false,
    duration: 0,
    sessionMinutes: 0,
    credits: 0,
    remote: 0,
    expiresDays: 365,
    discipline: team.sport,
    resources: [],
    lines: [{ label: "Payment toward accepted season fee", cents: a.amount }],
    teamRate: false,
    needsSlot: false,
    consentAt: new Date(at).toISOString(),
    teamFee,
  };
  return {
    action: "create" as const,
    expectedVersion: basis.version,
    holdUntil: new Date(at + 600000).toISOString(),
    quote,
  };
}

export function validateFinancialTeamPayment(
  basis: FinancialBasis,
  order: SquareOrder,
  payer: CurrentFinancialPayerEligibility,
) {
  const m = snapshot(order);
  const { identity, player, team } = resolveFinancialTeamPayment(basis, order);
  if (payer.userId !== order.user_id) throw new Error("Payment account changed.");
  assertFinancialTeamPayer(basis, identity.id, payer);
  integerCents(order.total_cents, "team payment", true);
  if (
    team.closed ||
    player.withdrawn ||
    !player.agreement.signedAt ||
    !player.feeLock ||
    player.feeLock.lockedAt !== m.lockedAt ||
    player.roleType !== m.role ||
    order.total_cents > remainingTeamPaymentCents(player)
  )
    throw new Error("The accepted fee or remaining balance changed. Refresh before paying.");
  return { agreementId: identity.id, expectedVersion: basis.version };
}

/** Only after verifiedPayment and live refund checks in fulfillSquarePayment.
 * Provider reconciliation must still run if the payer was subsequently disabled.
 * Mirrors the existing post-charge fee-lock/balance decision; this is not a new
 * payment authorization or a substitute for the provider's duplicate-ID guard.
 */
export function financialTeamFulfillmentDecision(basis: FinancialBasis, order: SquareOrder) {
  const m = snapshot(order);
  const { identity, player } = resolveFinancialTeamPayment(basis, order);
  integerCents(order.total_cents, "team payment", true);
  const review =
    !player.feeLock ||
    player.feeLock.lockedAt !== m.lockedAt ||
    player.roleType !== m.role ||
    order.total_cents > remainingTeamPaymentCents(player);
  return {
    agreementId: identity.id,
    expectedVersion: basis.version,
    status: review ? ("payment_review" as const) : ("paid" as const),
    queueRefund: review,
  };
}

export type FinancialPaymentLedgerTransform =
  | { changed: false; expectedVersion: number }
  | {
      changed: true;
      expectedVersion: number;
      nextInputs: FinancialInputs;
      audit: {
        agreementId: string;
        teamSeasonId: string;
        teamId: string;
        playerId: string;
        paymentId: string;
        gross: number;
        refunded: number;
        external: number;
        net: number;
      };
    };

/** Calculate a detached ledger update, not a committed write/receipt. A future
 * provider-scoped writer must hold the order/payment/basis locks and atomically
 * append nextInputs + CAS expectedVersion + audit + order/notification changes.
 * Current Square gross/refunds and reconciled external refunds are never frozen
 * in initialization. Upstream applySquareRefundBalance keeps refunds monotonic.
 */
export function transformFinancialTeamPaymentLedger(
  basis: FinancialBasis,
  input: {
    expectedVersion: number;
    order: SquareOrder;
    payment: LiveSquareTeamPayment | null;
    externalReconciledCents: number;
    now: Date;
  },
): FinancialPaymentLedgerTransform {
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 1 ||
    input.expectedVersion !== basis.version
  )
    throw new Error("Financial basis changed. Refresh before saving.");
  const unchanged = { changed: false as const, expectedVersion: basis.version };
  const { order, payment } = input;
  if (
    !order.snapshot.teamFee ||
    !order.square_payment_id ||
    order.payment_environment !== "production"
  )
    return unchanged;
  if (!payment) return unchanged;
  const { identity, player } = resolveFinancialTeamPayment(basis, order);
  if (
    payment.id !== order.square_payment_id ||
    payment.order_id !== order.id ||
    payment.environment !== order.payment_environment ||
    payment.status !== "COMPLETED" ||
    payment.amount_cents !== order.total_cents
  )
    throw new Error("Verified Square ledger identity mismatch.");
  const gross = integerCents(payment.amount_cents, "Square payment", true);
  const refunded = integerCents(payment.refunded_cents, "Square refund");
  const external = integerCents(input.externalReconciledCents, "external refund");
  if (refunded > gross || !Number.isSafeInteger(refunded + external))
    throw new Error("Invalid Square refund balance.");
  const net = Math.max(0, gross - refunded - external);
  const label = "Square: " + payment.id;
  const matching = basis.inputs.club.teams.flatMap((t) =>
    t.roster.flatMap((p) =>
      p.payments
        .filter((row) => row.label === label && row.method === "Square website")
        .map((row) => ({ player: p, row })),
    ),
  );
  if (matching.length > 1 || (matching[0] && matching[0].player !== player))
    throw new Error("Square payment has an ambiguous financial ledger association.");
  const existing = matching[0]?.row;
  if (!existing && order.status !== "paid") return unchanged;
  if (existing) {
    const recorded = Math.round(existing.amount * 100);
    if (
      !Number.isFinite(existing.amount) ||
      !Number.isSafeInteger(recorded) ||
      recorded < 0 ||
      Math.abs(existing.amount * 100 - recorded) > 1e-6
    )
      throw new Error("Invalid recorded Square payment amount.");
    // A stale provider row must not undo a refund already represented here.
    if (net > recorded)
      throw new Error("Square refund balance would restore previously returned funds.");
    if (recorded === net) return unchanged;
  }
  const draft = structuredClone(basis);
  const target = resolveFinancialAgreement(draft, { agreementId: identity.id }).player;
  if (existing) {
    const row = target.payments.find((p) => p.label === label && p.method === "Square website")!;
    row.amount = net / 100;
  } else {
    target.payments.push({
      date: new Date(time(order.paid_at || input.now, "payment")).toISOString().slice(0, 10),
      amount: net / 100,
      fee: 0,
      charged: gross / 100,
      method: "Square website",
      label,
      receipt: payment.receipt_url || payment.id,
    });
  }
  target.depositPaid =
    Math.round(target.payments.reduce((sum, p) => sum + p.amount, 0) * 100) >=
    Math.round((target.planLock?.dep || 0) * 100);
  return {
    changed: true,
    expectedVersion: basis.version,
    nextInputs: draft.inputs,
    audit: {
      agreementId: identity.id,
      teamSeasonId: identity.teamSeasonId,
      teamId: order.snapshot.teamFee.teamId,
      playerId: order.snapshot.teamFee.playerId,
      paymentId: payment.id,
      gross,
      refunded,
      external,
      net,
    },
  };
}
