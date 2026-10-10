import {
  total,
  payableStatus,
  type Payable,
  type RecordRow,
  type Settings,
  type Payment,
  type BankTxn,
} from "./contracts";
export function financeSummary(
  records: RecordRow[],
  settings: Settings,
  sources: {
    teams: any[];
    warnings: string[];
    refunds: any[];
    payments: any[];
    receivables: any[];
    candidates: Payable[];
  },
  date: string,
) {
  const values = (kind: string) => records.filter((r) => r.kind === kind).map((r) => r.payload);
  const accounts = values("account"),
    bank = values("bank") as BankTxn[],
    payments = values("payment") as Payment[],
    stored = values("payable") as Payable[];
  const payables = [
    ...stored,
    ...sources.candidates.filter((c) => !stored.some((p) => p.id === c.id)),
  ].map((p) => {
    const candidate = sources.candidates.find((c) => c.id === p.id);
    const earned = candidate && !p.manualOverride ? candidate.earned : p.earned;
    const inProgress = total(
      payments
        .filter((x) => x.payableId === p.id && x.state === "in progress")
        .map((x) => x.amount),
    );
    return {
      ...p,
      earned,
      remaining: p.state === "canceled" ? 0 : Math.max(0, earned - p.paid),
      notEarned: Math.max(0, p.amount - earned),
      inProgress,
      status: payableStatus({ ...p, earned }, date, inProgress),
    };
  });
  const accountBalances = accounts.map((a) => ({
    id: String(a.id),
    bank: String(a.bank),
    nickname: String(a.nickname),
    last4: String(a.last4),
    active: Boolean(a.active),
    balance:
      a.opening +
      total(
        bank
          .filter((t) => t.accountId === a.id && t.verified && t.date >= a.openingDate)
          .map((t) => t.amount),
      ),
    lastReconciled:
      bank
        .filter((t) => t.accountId === a.id && t.verified)
        .map((t) => t.date)
        .sort()
        .at(-1) || a.openingDate,
  }));
  const cash = total(accountBalances.filter((a) => a.active).map((a) => a.balance));
  const pendingPayments = total(
    payments.filter((p) => p.state === "in progress").map((p) => p.amount),
  );
  const teams = sources.teams.map((t) => {
    const owed = total(
      payables.filter((p) => p.teamId === t.id && p.category !== "owner").map((p) => p.remaining),
    );
    return { ...t, payables: owed, protectedDirect: Math.max(t.protectedDirect, owed) };
  });
  const teamDirect = total(teams.map((t) => t.protectedDirect)),
    contingency = total(teams.map((t) => t.contingency)),
    deferred = total(teams.map((t) => t.deferred));
  const externalRefundIds = new Set(
    payables.filter((p) => p.category === "refund").map((p) => p.source?.replace("refund:", "")),
  );
  const refundObligations = total(
    sources.refunds
      .filter((r) => !["completed", "rejected"].includes(r.status) && !externalRefundIds.has(r.id))
      .map((r) => r.amount_cents),
  );
  const otherPayables = total(payables.filter((p) => !p.teamId).map((p) => p.remaining));
  const priorDistributions = total(
    payables.filter((p) => p.category === "owner" && p.state !== "canceled").map((p) => p.earned),
  );
  const profitAvailable = Math.max(0, settings.profit - priorDistributions);
  const protectedCash =
    teamDirect +
    contingency +
    deferred +
    otherPayables +
    refundObligations +
    settings.reserve +
    settings.tax +
    settings.restricted;
  const warnings = [...sources.warnings];
  if (!settings.profit)
    warnings.push("Review earned organization profit before authorizing owner distributions.");
  if (!accounts.some((a) => a.active))
    warnings.push("Add the business account and its verified opening balance.");
  if (bank.some((t) => !t.verified)) warnings.push("Reconcile all imported bank transactions.");
  if (values("payment").some((p) => p.state === "in progress"))
    warnings.push("Reconcile payments in progress before approving owner distributions.");
  if (settings.reviewedThrough !== date || settings.reviewNote.trim().length < 5)
    warnings.push(
      "Review all liabilities and bank balances through today before approving distributions.",
    );
  if (
    !values("sync").some((s) => s.through?.slice(0, 10) === date && s.environment === "production")
  )
    warnings.push("Sync Square settlements through today before approving distributions.");
  if (payables.some((p) => p.paid > p.earned))
    warnings.push("Review compensation overpayments/refund adjustments.");
  if (stored.some((p) => p.legacyPaid))
    warnings.push("Reconcile legacy compensation payments before certifying available owner cash.");
  const settlements = values("settlement");
  if (settlements.some((s) => s.bankId && s.status !== "PAID"))
    warnings.push("Review a previously matched Square settlement whose provider status changed.");
  if (settlements.some((s) => s.environment === "production" && s.status === "PAID" && !s.bankId))
    warnings.push("Match deposited Square settlements to the bank.");
  const receivables = [
    ...sources.receivables,
    ...values("invoice").map((i) => {
      const paid = total(
        bank.filter((b) => b.verified && b.match === "invoice:" + i.id).map((b) => b.amount),
      );
      const credits = total(
        values("invoiceAdjustment")
          .filter((a) => a.invoiceId === i.id)
          .map((a) => a.amount),
      );
      return {
        ...i,
        paid,
        credits,
        remaining: Math.max(0, i.amount - paid - credits),
        status:
          paid + credits >= i.amount
            ? "PAID"
            : i.due < date
              ? "PAST DUE"
              : paid
                ? "PARTIALLY PAID"
                : i.due === date
                  ? "DUE"
                  : "NOT YET DUE",
      };
    }),
  ];
  return {
    accountBalances,
    cash,
    pendingPayments,
    teamDirect,
    contingency,
    deferred,
    otherPayables,
    refundObligations,
    protectedCash,
    operatingCash:
      cash -
      teamDirect -
      contingency -
      deferred -
      otherPayables -
      refundObligations -
      settings.tax -
      settings.restricted,
    available: Math.max(0, cash - protectedCash),
    profitAvailable,
    distributable: warnings.length
      ? 0
      : Math.min(profitAvailable, Math.max(0, cash - protectedCash)),
    warnings: [...new Set(warnings)],
    payables,
    teams,
    receivables,
    outstanding: total(receivables.map((r) => r.remaining)),
    unmatched: bank.filter((b) => !b.verified).length,
    squarePending: total(
      settlements
        .filter((s) => s.environment === "production" && s.status === "SENT")
        .map((s) => s.amount),
    ),
    squareReceived: total(
      sources.payments
        .filter((p) => p.status === "COMPLETED" && p.environment === "production")
        .map((p) => p.amount_cents),
    ),
    squareBankDeposits: total(
      bank.filter((b) => b.verified && b.match?.startsWith("settlement:")).map((b) => b.amount),
    ),
  };
}
