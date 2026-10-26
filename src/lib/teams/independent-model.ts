import { z } from "zod";

const cents = z.number().int().min(0).max(100_000_000);
const date = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v + "T12:00:00Z")) &&
        new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v),
    "Use a valid calendar date.",
  );
export const independentTermsSchema = z
  .object({
    seasonKey: z.string().uuid(),
    uniformDeposit: cents,
    uniformDue: date,
    monthlyDues: cents,
    firstDue: date,
    billingDay: z.number().int().min(1).max(31),
    lastDue: date,
    seasonEnd: date,
    processingExplanation: z.string().max(2000),
  })
  .strict();
export type IndependentTerms = z.infer<typeof independentTermsSchema>;
export type IndependentBudget = {
  fundingModel?: "organization" | "independent";
  independent?: IndependentTerms;
  processingBps: number;
  processingFixed: number;
};
export const isIndependent = (b: { fundingModel?: string }) => b.fundingModel === "independent";
export type IndependentInstallment = {
  id: string;
  kind: "uniform" | "monthly";
  amount: number;
  base: number;
  processing: number;
  due: string;
  label: string;
};

/** Present historical installment labels without changing accepted financial records. */
export function independentInstallmentLabel(row: { kind?: string; label: string }) {
  return row.kind === "uniform" || row.label === "Uniform deposit" ? "Initial deposit" : row.label;
}

export function independentSchedule(b: IndependentBudget): IndependentInstallment[] {
  const t = independentTermsSchema.parse(b.independent);
  if (!t.uniformDue || !t.firstDue || !t.lastDue || !t.seasonEnd) return [];
  if (t.lastDue < t.firstDue || t.uniformDue > t.lastDue)
    throw Error("Deposit and first installment must fall on or before the final billing date.");
  if (
    b.processingBps < 0 ||
    b.processingBps > 2000 ||
    !Number.isInteger(b.processingBps) ||
    !Number.isSafeInteger(b.processingFixed) ||
    b.processingFixed < 0
  )
    throw Error("Invalid processing fee.");
  const row = (
    id: string,
    kind: "uniform" | "monthly",
    base: number,
    due: string,
    label: string,
  ) => {
    const amount = base
      ? Math.ceil(((base + b.processingFixed) * 10000) / (10000 - b.processingBps))
      : 0;
    return { id, kind, base, amount, processing: amount - base, due, label };
  };
  const rows = [row("uniform", "uniform", t.uniformDeposit, t.uniformDue, "Initial deposit")];
  const [year, month] = t.firstDue.split("-").map(Number);
  for (let i = 0; i < 36; i++) {
    const start = new Date(Date.UTC(year, month - 1 + i, 1, 12));
    const last = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    const due =
      i === 0
        ? t.firstDue
        : new Date(
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), Math.min(last, t.billingDay), 12),
          )
            .toISOString()
            .slice(0, 10);
    if (due > t.lastDue) break;
    rows.push(
      row(
        "monthly:" + due.slice(0, 7),
        "monthly",
        t.monthlyDues,
        due,
        "Prospects dues — " + due.slice(0, 7),
      ),
    );
  }
  if (new Date(t.lastDue + "T12:00:00Z").getTime() >= Date.UTC(year, month - 1 + 36, 1, 12))
    throw Error("Billing terms may span at most 36 months.");
  return rows;
}

export function independentIssues(b: IndependentBudget & { policy: string }, today = "") {
  const issues: string[] = [];
  try {
    const t = independentTermsSchema.parse(b.independent);
    if (![t.uniformDue, t.firstDue, t.lastDue, t.seasonEnd].every(Boolean))
      issues.push("Enter the deposit, first and final billing dates and season end date.");
    if (today && t.lastDue && t.lastDue < today)
      issues.push("The billing term has ended. Review the next season before publishing.");
    if (today && (t.uniformDue < today || t.firstDue < today))
      issues.push(
        "Choose prospective deposit and first billing dates; late-entry terms require an explicit new schedule.",
      );
    if (t.lastDue && t.seasonEnd && t.lastDue > t.seasonEnd)
      issues.push("Billing must end on or before the season end date.");
    if (t.uniformDue && t.firstDue && t.uniformDue > t.firstDue)
      issues.push("The initial deposit must be due on or before the first monthly installment.");
    if (!b.policy.trim()) issues.push("Enter the payment/refund and enrollment policy.");
    if (!t.processingExplanation.trim())
      issues.push(
        "Explain the processing fee, including an explicit no-fee arrangement when applicable.",
      );
    const rows = independentSchedule(b);
    if (!rows.length) issues.push("Complete the billing schedule.");
  } catch (e) {
    issues.push(e instanceof Error ? e.message : "Review the independent payment terms.");
  }
  return [...new Set(issues)];
}

/** Clear all legacy assessments on a detached draft. Frozen accepted budgets stay unchanged. */
export function independentDraft<T extends IndependentBudget>(b: T): T {
  if (!isIndependent(b)) return b;
  const t = b.independent;
  return {
    ...b,
    start: t?.firstDue || "",
    end: t?.seasonEnd || "",
    months: Math.max(1, t ? independentSchedule(b).filter((r) => r.kind === "monthly").length : 1),
    membershipMonthly: t?.monthlyDues || 0,
    poMembershipMonthly: t?.monthlyDues || 0,
    fullOrg: 0,
    poOrg: 0,
    contingencyBps: 0,
    costs: [],
    tournament: 0,
    programModel: undefined,
    programCostModel: undefined,
    tournamentEstimate: undefined,
    uniformEstimate: undefined,
    hotelNightly: 0,
    hotelNights: 0,
    uniformCost: 0,
    fullIncremental: 0,
    poIncremental: 0,
    poSharedAllocation: 0,
    serviceCostMonthly: 0,
    overhead: 0,
    reserve: 0,
    additionalPlayerCosts: [],
    eventPaymentSchedule: undefined,
    paymentSchedule: undefined,
    roundTo: 0,
    scheduleCostsAutomatic: false,
    lateFee: 0,
    lateFeeBps: undefined,
    coachTournament: false,
    coachUniform: false,
    automaticPayments: true,
    deadlineOverride: t?.lastDue || "",
    secondDue: "",
  };
}

export function independentCalculation(b: IndependentBudget) {
  const rows = independentSchedule(b);
  const total = rows.reduce((n, r) => n + r.amount, 0);
  const net = rows.reduce((n, r) => n + r.base, 0);
  const member = rows.filter((r) => r.kind === "monthly").reduce((n, r) => n + r.base, 0);
  return {
    months: rows.filter((r) => r.kind === "monthly").length,
    member,
    poMember: member,
    uniformComponent: b.independent?.uniformDeposit || 0,
    teamComponent: 0,
    poAllocation: 0,
    contingencyComponent: 0,
    poDiscount: 0,
    poSubsidy: 0,
    fixed: 0,
    externalDirect: 0,
    programDirect: 0,
    direct: 0,
    contingency: 0,
    protectedBudget: 0,
    allocation: 0,
    full: total,
    po: total,
    fullNet: net,
    poNet: net,
    poContingency: 0,
    fullProcessing: total - net,
    fullRounding: 0,
    poProcessing: total - net,
    poRounding: 0,
  };
}

export const independentCollectionConsent =
  "I authorize Prospects Sports Academy to collect only this player's accepted initial deposit and monthly Prospects dues, including the processing fees disclosed in that schedule, using my Square payment methods. Collection begins at 9 a.m. America/Chicago on each due date. Short months use the last valid day. A confirmed decline may use my authorized backup card the next day; uncertain outcomes stop for review. No team-managed expense, legacy organization fee, contingency or late fee is authorized. New scheduled charges stop at the final billing date. I may revoke future automatic collection; existing accepted obligations are not forgiven. An admin withdrawal or season cancellation stops future installments and automatic collection; amounts already owed and the accepted deposit for uniforms already purchased or paid for remain due. A payment already submitted may still complete and will be reconciled.";

export function independentPublishedPolicy(
  b: IndependentBudget & { policy: string },
  rows = independentSchedule(b),
) {
  return (
    "Payments to Prospects — per player. Independent team expenses are set and collected separately by the team.\n\n" +
    b.policy +
    "\n\n" +
    b.independent!.processingExplanation +
    "\n\n" +
    rows
      .map(
        (r) =>
          `${independentInstallmentLabel(r)}: $${(r.base / 100).toFixed(2)} + $${(r.processing / 100).toFixed(2)} processing = $${(r.amount / 100).toFixed(2)}, due ${r.due}.`,
      )
      .join("\n") +
    "\n\nPublication and acceptance do not activate autopay. Separate payer authorization is required. " +
    independentCollectionConsent
  );
}
