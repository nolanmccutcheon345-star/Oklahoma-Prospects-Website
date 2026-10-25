import { budgetCost, calculateFees, effectiveFeeBudget, type FeeBudget } from "../teams/fee-model";
import type { FeePlan } from "../teams/fee-contracts";
import type { Payable, RecordRow } from "./contracts";
import { spendingCategories, type SpendingCategory } from "./team-spending";

export type BudgetLine = { id: string; name: string; category: SpendingCategory; budget: number };
export function budgetCategory(name: string): SpendingCategory {
  if (/gas|fuel|coach travel/i.test(name)) return "gas";
  if (/hotel|lodging/i.test(name)) return "hotel";
  if (/coach/i.test(name)) return "coach";
  if (/tournament|entry fee/i.test(name)) return "tournament";
  if (/uniform/i.test(name)) return "uniform";
  if (/facility|field rental|rent/i.test(name)) return "facility";
  return "other";
}
export function publishedSpendingLines(input: FeeBudget): BudgetLine[] {
  const b = effectiveFeeBudget(input),
    f = calculateFees(b);
  return [
    ...b.costs.map((c) => ({
      id: "cost:" + c.id,
      name: c.name,
      category: budgetCategory(c.name),
      budget: budgetCost(b, c),
    })),
    {
      id: "base:tournament",
      name: "Tournament entries",
      category: "tournament" as const,
      budget: b.tournament,
    },
    {
      id: "base:uniform",
      name: "Uniform packages",
      category: "uniform" as const,
      budget: b.uniformCost * b.baseline,
    },
    {
      id: "base:hotel",
      name: "Scheduled coach hotel stipends",
      category: "hotel" as const,
      budget: b.hotelNightly * b.hotelNights,
    },
    {
      id: "base:incremental",
      name: "Other per-player direct costs",
      category: "other" as const,
      budget: b.fullIncremental * b.baseline,
    },
    {
      id: "reserve:contingency",
      name: "Team contingency",
      category: "other" as const,
      budget: f.contingency,
    },
  ];
}
export function pinSpendingBudget(plan: FeePlan) {
  if (!plan.spendingBudget && plan.publishedBudget && plan.published)
    plan.spendingBudget = {
      budget: structuredClone(plan.publishedBudget),
      publishedAt: plan.published.at,
      publicationRevision: plan.published.revision,
    };
}
/** One expense source for the legacy fee summary and the detailed Finance ledger. */
export function teamExpenseTotals(plan: FeePlan, records: RecordRow[], teamId: string) {
  const expenses = plan.expenses || [];
  const payables = records
    .filter(
      (r) =>
        r.kind === "payable" &&
        r.payload.teamId === teamId &&
        !["owner", "refund"].includes(r.payload.category),
    )
    .map((r) => r.payload as Payable);
  let paid = 0,
    unpaid = 0,
    unverifiedPaid = 0,
    contingencyPaid = 0,
    contingencyCommitted = 0;
  for (const p of payables) {
    const mirror = expenses.find((e) => p.id === `expense:${teamId}:${e.id}`);
    const recordedPaid = Math.max(p.paid, mirror?.paid ? mirror.cents : 0);
    const amount = p.state === "canceled" ? recordedPaid : Math.max(p.amount, recordedPaid);
    const line =
      records.find(
        (r) =>
          r.kind === "budgetAssignment" &&
          r.payload.payableId === p.id &&
          r.payload.teamId === teamId,
      )?.payload.lineId || p.budgetLineId;
    paid += recordedPaid;
    unpaid += amount - recordedPaid;
    unverifiedPaid += (p.legacyPaid ? p.paid : 0) + Math.max(0, recordedPaid - p.paid);
    if (line === "reserve:contingency" || (!line && mirror?.contingency)) {
      contingencyCommitted += amount;
      contingencyPaid += recordedPaid;
    }
  }
  for (const e of expenses.filter(
    (e) => !payables.some((p) => p.id === `expense:${teamId}:${e.id}`),
  )) {
    if (e.paid) {
      paid += e.cents;
      unverifiedPaid += e.cents;
      if (e.contingency) contingencyPaid += e.cents;
    } else unpaid += e.cents;
    if (e.contingency) contingencyCommitted += e.cents;
  }
  contingencyCommitted += records
    .filter((r) => r.kind === "teamBudgetTransfer" && r.payload.teamId === teamId)
    .reduce((n, r) => n + r.payload.cents, 0);
  const sent = records
    .filter(
      (r) =>
        r.kind === "payment" &&
        r.payload.state === "in progress" &&
        payables.some((p) => p.id === r.payload.payableId),
    )
    .reduce((n, r) => n + r.payload.amount, 0);
  return {
    paid,
    unpaid,
    unverifiedPaid,
    verifiedPaid: paid - unverifiedPaid,
    sent,
    contingencyCommitted,
    contingencyPaid,
    directPaid: paid - contingencyPaid,
  };
}
export function teamBudgetLedger(plan: FeePlan | undefined, records: RecordRow[], teamId: string) {
  const source = plan?.spendingBudget?.budget || plan?.publishedBudget;
  if (!source) return null;
  const published = publishedSpendingLines(source);
  const transfers = records.filter(
    (r) => r.kind === "teamBudgetTransfer" && r.payload.teamId === teamId,
  );
  const assigned = records.filter(
    (r) => r.kind === "budgetAssignment" && r.payload.teamId === teamId,
  );
  const lineFor = (p: Payable) =>
    assigned.find((r) => r.payload.payableId === p.id)?.payload.lineId || p.budgetLineId || "";
  const payables = records
    .filter(
      (r) =>
        r.kind === "payable" &&
        r.payload.teamId === teamId &&
        !["owner", "refund"].includes(r.payload.category),
    )
    .map((r) => r.payload as Payable);
  const payments = records.filter((r) => r.kind === "payment" && r.payload.state === "in progress");
  const rows = published.map((line) => {
    const adjustment = transfers.reduce(
      (n, r) =>
        n +
        (r.payload.lineId === line.id
          ? r.payload.cents
          : line.id === "reserve:contingency"
            ? -r.payload.cents
            : 0),
      0,
    );
    const items = payables.filter((p) => lineFor(p) === line.id);
    const allocated = items.reduce(
      (n, p) => n + (p.state === "canceled" ? Math.max(p.paid, p.approved) : p.amount),
      0,
    );
    const approved = items.reduce((n, p) => n + Math.max(p.approved, p.paid), 0);
    const paid = items.filter((p) => !p.legacyPaid).reduce((n, p) => n + p.paid, 0);
    const historicalPaid = items.filter((p) => p.legacyPaid).reduce((n, p) => n + p.paid, 0);
    const sent = payments
      .filter((r) => items.some((p) => p.id === r.payload.payableId))
      .reduce((n, r) => n + r.payload.amount, 0);
    return {
      ...line,
      adjustment,
      currentBudget: line.budget + adjustment,
      allocated,
      approved,
      paid,
      historicalPaid,
      sent,
      remaining: line.budget + adjustment - allocated,
      payables: items.map((p) => ({
        id: p.id,
        payeeId: p.payeeId,
        payeeName:
          records.find((r) => r.kind === "payee" && r.id === p.payeeId)?.payload.name || p.payeeId,
        reason: p.reason,
        amount: p.amount,
        approved: p.approved,
        paid: p.paid,
        legacyPaid: Boolean(p.legacyPaid),
        state: p.state,
        invoiceReference: p.invoiceReference || "",
        due: p.due,
        payments: records
          .filter((r) => r.kind === "payment" && r.payload.payableId === p.id)
          .map((r) => ({
            id: r.id,
            date: r.payload.date,
            amount: r.payload.amount,
            state: r.payload.state,
            reference: r.payload.reference,
          })),
      })),
    };
  });
  const unallocated = payables
    .filter((p) => !published.some((l) => l.id === lineFor(p)))
    .map((p) => ({ id: p.id, name: p.reason, amount: p.amount, paid: p.paid, state: p.state }));
  const historicalExpenses = (plan?.expenses || [])
    .filter((e) => e.paid && !payables.some((p) => p.id === `expense:${teamId}:${e.id}`))
    .map((e) => ({ id: e.id, name: e.name, amount: e.cents }));
  const limits = Object.fromEntries(
    spendingCategories.map((c) => [
      c,
      rows.filter((l) => l.category === c).reduce((n, l) => n + l.currentBudget, 0),
    ]),
  ) as Record<SpendingCategory, number>;
  const f = calculateFees(source),
    b = effectiveFeeBudget(source);
  return {
    publishedAt: plan?.spendingBudget?.publishedAt || plan?.published?.at || "",
    publicationRevision:
      plan?.spendingBudget?.publicationRevision || plan?.published?.revision || 0,
    rows,
    limits,
    unallocated,
    historicalExpenses,
    transfers: transfers.map((r) => ({
      id: r.id,
      at: String(r.payload.at),
      lineId: String(r.payload.lineId),
      cents: Number(r.payload.cents),
      reason: String(r.payload.reason),
    })),
    externalBudget: rows.reduce((n, l) => n + l.budget, 0),
    internalProgram: Math.round(b.membershipMonthly * b.months) * b.baseline,
    organizationAllocation: b.fullOrg * b.baseline,
    processingAllowance: f.fullProcessing * b.baseline,
    feeRounding: f.fullRounding * b.baseline,
    internalNotice:
      "Program and organization allocations are internal fee components, not additional external spending budgets.",
    verifiedPaid: rows.reduce((n, l) => n + l.paid, 0),
    totalAllocated: rows.reduce((n, l) => n + l.allocated, 0),
    directBudget: f.externalDirect,
  };
}
export function assertBudgetAssignment(
  plan: FeePlan | undefined,
  records: RecordRow[],
  p: Payable,
) {
  const ledger = teamBudgetLedger(plan, records, p.teamId);
  if (!ledger) throw Error("Publish the team's budget before assigning team spending.");
  const assignment = records.find(
    (r) =>
      r.kind === "budgetAssignment" &&
      r.payload.teamId === p.teamId &&
      r.payload.payableId === p.id,
  );
  const lineId = assignment?.payload.lineId || p.budgetLineId;
  const line = ledger.rows.find((l) => l.id === lineId);
  if (!line) throw Error("Assign this payable to its published team budget line before approval.");
  if (
    ledger.unallocated.some((p) => (p.state !== "canceled" || p.paid > 0) && p.amount > 0) ||
    ledger.historicalExpenses.length
  )
    throw Error(
      "Assign all existing team expenses to budget lines, including historical paid entries, before approving new spending.",
    );
  const overBudget = ledger.rows.find((l) => l.remaining < 0);
  if (overBudget)
    throw Error(
      `${overBudget.name} exceeds its published budget allocation. Reduce requests or record an owner allocation from contingency.`,
    );
  return line;
}
