import { feeExplanationSchema } from "./fee-explanation";
import { withoutRetiredMembershipPricing } from "./retired-membership";
import { overheadRuleSchema } from "./facility-overhead";
import { z } from "zod";
import { calendarBillableMonths } from "./season-months";
import {
  independentTermsSchema,
  independentDraft,
  independentCalculation,
  independentSchedule,
  isIndependent,
} from "./independent-model";

// All monetary inputs and outputs are integer cents. Rates are basis points.
const cents = z.number().int().min(0).max(1_000_000_000);
const day = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v),
    "Use a valid date.",
  );
export const expenseSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(120),
    cents,
    paid: z.boolean(),
    contingency: z.boolean(),
    date: day,
  })
  .strict();
export const programFields = {
  programModel: z.literal(3).optional(),
  // Absent on frozen historical budgets: program was added after contingency.
  programCostModel: z.literal(1).optional(),
};
export const eventPaymentSchema = z
  .object({
    percentages: z.array(z.number().int().min(0).max(10000)).length(3),
    weeksBefore: z.array(z.number().int().min(0).max(52)).length(3),
  })
  .strict()
  .refine(
    (v) => v.percentages.reduce((a, b) => a + b, 0) === 10000,
    "Payment percentages must total 100%.",
  )
  .refine(
    (v) => v.weeksBefore[0] >= v.weeksBefore[1] && v.weeksBefore[1] >= v.weeksBefore[2],
    "Payment weeks must be in descending order.",
  );
export const pricingKeys = [
  "membershipMonthly",
  "poMembershipMonthly",
  "contingencyBps",
  "eventPaymentSchedule",
] as const;
export type PricingKey = (typeof pricingKeys)[number];
export const pricingInheritanceSchema = z
  .object({
    version: z.literal(1),
    overrides: z.array(z.enum(pricingKeys)),
    legacyReview: z.boolean().optional(),
  })
  .strict();
export const poAllocationFields = {
  poMembershipMonthly: cents.optional(),
  poTeamBps: z.number().int().min(0).max(10000).optional(),
  poUniformBps: z.number().int().min(0).max(10000).optional(),
  poContingencyBps: z.number().int().min(0).max(10000).optional(),
  poProcessingBps: z.number().int().min(0).max(10000).optional(),
  poOverrideReason: z.string().max(1000).optional(),
};
export const poDefaults = {
  poMembershipMonthly: 15000,
  poTeamBps: 10000,
  poUniformBps: 10000,
  poContingencyBps: 10000,
  poProcessingBps: 10000,
};
export const defaultPOOrganization = (full: number) => Math.ceil((full * 0.6) / 2500) * 2500;
export const budgetSchema = z
  .object({
    fundingModel: z.enum(["organization", "independent"]).optional(),
    independent: independentTermsSchema.optional(),
    parentExplanation: feeExplanationSchema.optional(),
    ...poAllocationFields,
    ...programFields,
    pricingInheritance: pricingInheritanceSchema.optional(),
    eventPaymentSchedule: eventPaymentSchema.optional(),
    pastDueReview: z
      .object({ key: z.string().max(4000), reason: z.string().max(1000) })
      .strict()
      .optional(),
    defaultMonths: z.number().positive().max(36).optional(),
    billableMonthsOverride: z.number().positive().max(36).optional(),
    billableMonthsReason: z.string().max(1000).optional(),
    additionalPlayerCosts: z
      .array(
        z
          .object({
            playerId: z.string().min(1).max(150),
            insurance: cents,
            registration: cents,
            other: cents,
          })
          .strict(),
      )
      .max(500)
      .refine(
        (rows) => new Set(rows.map((r) => r.playerId)).size === rows.length,
        "Enter additional costs only once per player.",
      )
      .optional(),
    poModel: z.literal(2).optional(),
    start: day,
    end: day,
    months: z.number().positive().max(36),
    baseline: z.number().int().min(1).max(100),
    membershipMonthly: cents,
    fullOrg: cents,
    poOrg: cents,
    contingencyBps: z.number().int().min(0).max(10000),
    costs: z
      .array(
        z
          .object({ id: z.string().min(1).max(100), name: z.string().min(1).max(120), cents })
          .strict(),
      )
      .max(60),
    roundTo: cents.optional(),
    headPremiumBps: z.number().int().min(0).max(2500).optional(),
    assistantPremiumBps: z.number().int().min(0).max(2500).optional(),
    scheduleCostsAutomatic: z.boolean().optional(),
    readiness: z
      .object({
        schedule: z.boolean(),
        gas: z.boolean(),
        hotels: z.boolean(),
        other: z.boolean(),
        processing: z.boolean(),
        noUniform: z.boolean(),
      })
      .strict()
      .optional(),
    tournament: cents,
    tournamentEstimate: cents.optional(),
    uniformEstimate: cents.optional(),
    hotelNightly: cents.default(0),
    hotelNights: z.number().int().min(0).max(10000).default(0),
    uniformId: z.string().max(100),
    uniformCost: cents,
    fullIncremental: cents,
    poIncremental: cents,
    poSharedAllocation: cents,
    serviceCostMonthly: cents,
    processingBps: z.number().int().min(0).max(2000),
    processingFixed: cents,
    overhead: cents,
    overheadRule: overheadRuleSchema.optional(),
    reserve: cents,
    nolanBps: z.number().int().min(0).max(10000),
    paymentSchedule: z
      .object({
        mode: z.enum(["percent", "amount"]),
        rows: z
          .array(z.object({ full: cents, po: cents, due: day }).strict())
          .min(2)
          .max(13),
      })
      .strict()
      .optional(),
    daysBeforeTournament: z.number().int().min(0).max(365).default(28),
    triggerEventId: z.string().max(150),
    deadlineOverride: day,
    secondDue: day,
    poEnabled: z.boolean().optional(),
    poRosterLimit: z.number().int().min(0).max(100).optional(),
    noUniformReason: z.string().max(1000).optional(),
    processingZeroReason: z.string().max(1000).optional(),
    uniformCutoff: day,
    graceDays: z.number().int().min(0).max(365),
    holdDays: z.number().int().min(1).max(365),
    removalDays: z.number().int().min(1).max(730),
    lateFee: cents,
    automaticPayments: z.literal(true).optional(),
    lateFeeBps: z.literal(2000).optional(),
    policy: z.string().max(10000),
    reinstatement: z.string().max(3000),
    coachTournament: z.boolean(),
    coachUniform: z.boolean(),
  })
  .strict();
export type FeeBudget = z.infer<typeof budgetSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export const defaultBudget = (): FeeBudget => ({
  ...poDefaults,
  poModel: 2,
  programModel: 3,
  programCostModel: 1,
  start: "",
  end: "",
  months: 3,
  baseline: 10,
  membershipMonthly: 15000,
  fullOrg: 0,
  poOrg: 0,
  contingencyBps: 1500,
  costs: [
    "Head coach",
    "Assistant coach",
    "Additional coaching",
    "Coach travel",
    "Hotels",
    "Mileage",
    "Meals / per diem",
    "Baseballs",
    "Insurance",
    "Background checks",
    "Field rental",
    "Umpires",
    "Equipment",
    "Software / admin",
    "Team operations",
    "Miscellaneous",
  ].map((name, i) => ({ id: "cost-" + i, name, cents: 0 })),
  tournament: 0,
  hotelNightly: 0,
  hotelNights: 0,
  uniformId: "",
  uniformCost: 0,
  fullIncremental: 0,
  poIncremental: 0,
  poSharedAllocation: 0,
  serviceCostMonthly: 0,
  processingBps: 0,
  processingFixed: 0,
  overhead: 0,
  reserve: 0,
  nolanBps: 5000,
  daysBeforeTournament: 28,
  triggerEventId: "",
  deadlineOverride: "",
  secondDue: "",
  uniformCutoff: "",
  graceDays: 7,
  holdDays: 21,
  removalDays: 35,
  lateFee: 0,
  automaticPayments: true,
  lateFeeBps: 2000,
  policy: "",
  reinstatement: "",
  coachTournament: true,
  coachUniform: true,
});
export function billableMonths(b: FeeBudget) {
  if (isIndependent(b))
    return Math.max(1, independentSchedule(b).filter((r) => r.kind === "monthly").length);
  return b.programModel === 3
    ? (b.billableMonthsOverride ?? calendarBillableMonths(b.start, b.end) ?? b.months)
    : b.months;
}
export function withBillableMonths(b: FeeBudget): FeeBudget {
  return { ...b, months: billableMonths(b) };
}
/** Explicit owner estimates replace, rather than add to, schedule/package costs. */
export function effectiveFeeBudget(b: FeeBudget): FeeBudget {
  if (isIndependent(b)) return independentDraft(b);
  return {
    ...withBillableMonths(b),
    tournament: b.tournamentEstimate ?? b.tournament,
    uniformCost: b.uniformEstimate ?? b.uniformCost,
  };
}
// An upgrade changes only the new offer. Historical published snapshots stay legacy.
export function programDraft(b: FeeBudget): FeeBudget {
  if (isIndependent(b)) return independentDraft(b);
  b = { ...withoutRetiredMembershipPricing(b), programCostModel: 1 };
  if (b.programModel === 3) return withBillableMonths(b);
  return withBillableMonths({
    ...b,
    programModel: 3,
    defaultMonths: b.defaultMonths ?? b.months,
    membershipMonthly: b.membershipMonthly === 20000 ? 15000 : b.membershipMonthly,
  });
}
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n / 100);
export const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
export function installments(total: number) {
  if (!Number.isSafeInteger(total) || total < 0) throw Error("Invalid fee.");
  const deposit = Math.round(total * 0.4),
    second = Math.round(total * 0.3);
  return [deposit, second, total - deposit - second] as const;
}
export const shiftDay = (date: string, days: number) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// ISO timestamps are converted to the organization's calendar day; plain dates
// already represent local calendar days. Arithmetic below never uses host timezone.
export function organizationDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function deadline(b: FeeBudget, events: { id: string; start: string }[]) {
  if (isIndependent(b)) return b.independent?.lastDue || "";
  if (b.eventPaymentSchedule) {
    const dates = events
      .map((e) => organizationDay(e.start))
      .filter((d) => d && b.start && b.end && d >= b.start && d <= b.end)
      .sort();
    return dates[0] ? shiftDay(dates[0], -7 * b.eventPaymentSchedule.weeksBefore[2]) : "";
  }
  const first = events.filter((e) => e.start).sort((a, b) => a.start.localeCompare(b.start))[0];
  const chosen = b.paymentSchedule ? first : events.find((e) => e.id === b.triggerEventId) || first;
  return (
    b.deadlineOverride ||
    (chosen ? shiftDay(chosen.start.slice(0, 10), -(b.daysBeforeTournament ?? 28)) : "")
  );
}
export function midpointDay(start: string, end: string) {
  if (!start || !end) return "";
  if (start > end)
    throw Error("The final payment deadline has passed. Ask Front Office to review the schedule.");
  return shiftDay(
    start,
    Math.floor((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000 / 2),
  );
}
export function scheduleRows(
  b: FeeBudget,
  total: number,
  role: "full" | "po",
  final: string,
  accepted = "",
) {
  if (isIndependent(b)) return independentSchedule(b);
  if (b.eventPaymentSchedule) {
    const rule = eventPaymentSchema.parse(b.eventPaymentSchedule);
    const amounts = rule.percentages.map((n) => Math.round((total * n) / 10000));
    amounts[1] = Math.min(amounts[1], total - amounts[0]);
    amounts[2] = total - amounts[0] - amounts[1];
    if (!Number.isSafeInteger(total) || amounts.some((n) => n < 0)) throw Error("Invalid fee.");
    return amounts.map((amount, i) => ({
      amount,
      due: final ? shiftDay(final, -7 * (rule.weeksBefore[i] - rule.weeksBefore[2])) : "",
      label: ["Deposit", "Second payment", "Final payment"][i],
    }));
  }
  if (!b.paymentSchedule)
    return installments(total).map((amount, i) => ({
      amount,
      due: [accepted, b.secondDue || midpointDay(accepted, final), final][i],
      label: ["Deposit", "Second payment", "Final payment"][i],
    }));
  const { mode, rows } = b.paymentSchedule;
  const values = rows.map((r) => r[role]);
  if (mode === "percent" && sum(values) !== 10000)
    throw Error("Payment percentages must add up to 100% for full and pitcher-only players.");
  if (mode === "amount" && sum(values) !== total)
    throw Error("Payment amounts must add up to the calculated fee for each player type.");
  const amounts = mode === "percent" ? values.map((v) => Math.round((total * v) / 10000)) : values;
  if (mode === "percent") amounts[amounts.length - 1] = total - sum(amounts.slice(0, -1));
  if (amounts.some((n) => !Number.isSafeInteger(n) || n < 0))
    throw Error("Invalid payment amounts.");
  return amounts.map((amount, i) => ({
    amount,
    due: i === 0 ? accepted : i === rows.length - 1 ? final : rows[i].due,
    label: i === 0 ? "Deposit" : i === rows.length - 1 ? "Final payment" : `Payment ${i + 1}`,
  }));
}
export function paymentReviewKey(b: FeeBudget, final: string) {
  return JSON.stringify([
    b.start,
    b.end,
    b.eventPaymentSchedule,
    scheduleRows(b, 10000, "full", final),
  ]);
}
export function pastDueReviewed(b: FeeBudget, final: string) {
  return (
    b.pastDueReview?.key === paymentReviewKey(b, final) &&
    b.pastDueReview.reason.trim().length >= 10
  );
}
// Processing allowance follows the configured payment count, including per-charge rounding.
function gross(net: number, b: FeeBudget) {
  const count = b.eventPaymentSchedule ? 3 : b.paymentSchedule?.rows.length || 3;
  let total = Math.ceil((net + count * b.processingFixed) / (1 - b.processingBps / 10000));
  if (!b.paymentSchedule && !b.eventPaymentSchedule) {
    while (
      total -
        sum(
          installments(total).map(
            (n) => Math.ceil((n * b.processingBps) / 10000) + b.processingFixed,
          ),
        ) <
      net
    )
      total++;
  } else if (b.processingBps) {
    total = Math.ceil(
      (net + count * b.processingFixed + count - 1) / (1 - b.processingBps / 10000),
    );
  }
  return total;
}
/** The same cent rounding funds the budget and the coach payable. Legacy cost
 * rows retain their agreed values; only matrix premium rows add a premium. */
export function budgetCost(b: FeeBudget, c: FeeBudget["costs"][number]) {
  const rate =
    c.id === "matrix-head"
      ? b.headPremiumBps || 0
      : c.id === "matrix-assistant"
        ? b.assistantPremiumBps || 0
        : 0;
  return c.cents + Math.ceil((c.cents * rate) / 10000);
}
export function calculateFees(input: FeeBudget) {
  if (isIndependent(input)) return independentCalculation(budgetSchema.parse(input));
  const b = effectiveFeeBudget(budgetSchema.parse(withoutRetiredMembershipPricing(input)));
  const fixed =
    sum(b.costs.map((c) => budgetCost(b, c))) + b.tournament + b.hotelNightly * b.hotelNights;
  const programInDirect = b.programCostModel === 1;
  const member = Math.round(b.membershipMonthly * b.months);
  const each = b.uniformCost + b.fullIncremental,
    externalDirect = fixed + b.baseline * each,
    programDirect = programInDirect ? b.baseline * member : 0,
    direct = externalDirect + programDirect,
    contingency = Math.ceil((direct * b.contingencyBps) / 10000),
    protectedBudget = direct + contingency;
  const allocation = Math.ceil(protectedBudget / b.baseline);
  const fullNet = allocation + (programInDirect ? 0 : member) + b.fullOrg;
  // Only frozen legacy agreements retain the independent PO calculation.
  const linked = b.poModel === 2;
  const teamComponent = Math.ceil(fixed / b.baseline) + b.fullIncremental;
  const uniformComponent = b.uniformCost;
  // Assign rounding remainder to contingency so 100% shares equal allocation exactly.
  const contingencyComponent =
    allocation - teamComponent - uniformComponent - (programInDirect ? member : 0);
  const share = (n: number, rate: number | undefined) => Math.ceil((n * (rate ?? 10000)) / 10000);
  const poMember = linked ? Math.round((b.poMembershipMonthly ?? 15000) * b.months) : member;
  const poDirect =
    (linked
      ? share(teamComponent, b.poTeamBps) + share(uniformComponent, b.poUniformBps)
      : b.poSharedAllocation + b.uniformCost + b.poIncremental) + (programInDirect ? poMember : 0);
  // A PO player funds their own program rate, including its contingency. Equal
  // rates and 100% shares still reconcile exactly to the full-player allocation.
  const poStandardContingency =
    contingencyComponent +
    (programInDirect
      ? Math.ceil((poMember * b.contingencyBps) / 10000) -
        Math.ceil((member * b.contingencyBps) / 10000)
      : 0);
  const poContingency = linked
    ? share(poStandardContingency, b.poContingencyBps)
    : Math.ceil((poDirect * b.contingencyBps) / 10000);
  const poAllocation = poDirect + poContingency;
  const poStandardAllocation =
    teamComponent + uniformComponent + poStandardContingency + (programInDirect ? poMember : 0);
  const poNet = poAllocation + (programInDirect ? 0 : poMember) + b.poOrg;
  const rounded = (n: number) => (b.roundTo ? Math.ceil(n / b.roundTo) * b.roundTo : n);
  const full = rounded(gross(fullNet, b)),
    po = rounded(
      poNet +
        Math.ceil(
          ((gross(poNet, b) - poNet) * (linked ? (b.poProcessingBps ?? 10000) : 10000)) / 10000,
        ),
    );
  // Rounding creates margin, not a processing expense. Allow for card fees on the
  // final rounded amount, with at most one cent of rounding per installment.
  const processing = (total: number, net: number) =>
    b.roundTo
      ? Math.min(
          total - net,
          Math.ceil((total * b.processingBps) / 10000) +
            (b.eventPaymentSchedule ? 3 : b.paymentSchedule?.rows.length || 3) * b.processingFixed +
            (b.processingBps
              ? (b.eventPaymentSchedule ? 3 : b.paymentSchedule?.rows.length || 3) - 1
              : 0),
        )
      : total - net;
  const poProcessing = linked
    ? b.paymentSchedule || b.eventPaymentSchedule
      ? Math.ceil((po * b.processingBps) / 10000) +
        (b.eventPaymentSchedule ? 3 : b.paymentSchedule?.rows.length || 3) * b.processingFixed +
        (b.processingBps
          ? (b.eventPaymentSchedule ? 3 : b.paymentSchedule?.rows.length || 3) - 1
          : 0)
      : sum(
          installments(po).map(
            (amount) => Math.ceil((amount * b.processingBps) / 10000) + b.processingFixed,
          ),
        )
    : processing(po, poNet);
  return {
    months: b.months,
    poMember,
    poAllocation,
    teamComponent,
    uniformComponent,
    contingencyComponent,
    poDiscount: fullNet - poNet,
    poSubsidy:
      Math.max(0, poStandardAllocation - poAllocation) + Math.max(0, poProcessing - (po - poNet)),
    fixed,
    externalDirect,
    programDirect,
    direct,
    contingency,
    protectedBudget,
    member,
    allocation,
    full,
    po,
    fullNet,
    poNet,
    poContingency,
    fullProcessing: processing(full, fullNet),
    fullRounding: full - fullNet - processing(full, fullNet),
    poProcessing,
    poRounding: po - poNet - poProcessing,
  };
}
/** Actual-roster reports match incremental exceptions by player identity. */
export function budgetForRoster(b: FeeBudget, roster: { id: string; roleType: "full" | "po" }[]) {
  const ids = new Set(
    [
      ...roster.filter((p) => p.roleType === "full").slice(b.baseline),
      ...roster.filter((p) => p.roleType === "po"),
    ].map((p) => p.id),
  );
  return {
    ...b,
    additionalPlayerCosts: b.additionalPlayerCosts?.filter((c) => ids.has(c.playerId)),
  };
}
export function project(
  b: FeeBudget,
  fullCount: number,
  poCount: number,
  expenses: Expense[] = [],
  closed = false,
) {
  b = effectiveFeeBudget(b);
  for (const n of [fullCount, poCount])
    if (!Number.isInteger(n) || n < 0 || n > 500) throw Error("Invalid roster count.");
  const f = calculateFees(b),
    baselinePlayers = Math.min(fullCount, b.baseline),
    extra = Math.max(0, fullCount - b.baseline);
  const service = Math.round(b.serviceCostMonthly * b.months);
  const incrementalSurcharges = sum(
    (b.additionalPlayerCosts || [])
      .slice(0, extra + poCount)
      .map((c) => c.insurance + c.registration + c.other),
  );
  const extraRevenue = extra * f.full + poCount * f.po;
  const poIncremental = b.poModel === 2 ? b.fullIncremental : b.poIncremental;
  const extraCosts =
    extra * (b.uniformCost + b.fullIncremental + service + f.fullProcessing) +
    poCount * (b.uniformCost + poIncremental + service + f.poProcessing) +
    incrementalSurcharges;
  const reserve = f.contingency + (b.programModel === 3 ? 0 : poCount * f.poContingency);
  const externalDirect =
    f.fixed +
    fullCount * (b.uniformCost + b.fullIncremental) +
    poCount * (b.uniformCost + poIncremental) +
    incrementalSurcharges;
  const totalRevenue = fullCount * f.full + poCount * f.po,
    membership = fullCount * f.member + poCount * f.poMember,
    organization = fullCount * b.fullOrg + poCount * b.poOrg;
  const programDirect = b.programCostModel === 1 ? membership : 0;
  const direct = externalDirect + programDirect;
  const processing = fullCount * f.fullProcessing + poCount * f.poProcessing,
    serviceCosts = (fullCount + poCount) * service;
  const organizationAndProgramRevenue = membership + organization;
  const teamOperatingRevenue = totalRevenue - organizationAndProgramRevenue;
  const teamOperatingContribution =
    teamOperatingRevenue - externalDirect - processing - serviceCosts;
  const totalTeamAssociatedContribution = teamOperatingContribution + organizationAndProgramRevenue;
  // Protected contingency is a restriction on available funds, never a profit expense.
  const contribution = totalTeamAssociatedContribution - reserve;
  const used = sum(expenses.filter((e) => e.contingency).map((e) => e.cents)),
    remaining = Math.max(0, reserve - used);
  const unexpected = Math.max(0, used - reserve);
  const beforeOverhead = contribution - unexpected + (closed ? remaining : 0),
    net = beforeOverhead - b.overhead,
    distributable = Math.max(0, net - b.reserve);
  const nolan = Math.floor((distributable * b.nolanBps) / 10000);
  // Additional contribution already contains its membership and org allocations.
  // To reconcile all-player membership/org totals, use residualExtra, not extraContribution.
  const extraContribution =
    extraRevenue - extraCosts - (b.programModel === 3 ? 0 : poCount * f.poContingency);
  return {
    ...f,
    fullCount,
    poCount,
    baselinePlayers,
    extra,
    totalRevenue,
    organizationAndProgramRevenue,
    teamOperatingRevenue,
    teamOperatingContribution,
    totalTeamAssociatedContribution,
    incrementalSurcharges,
    externalDirect,
    programDirect,
    direct,
    reserve,
    membership,
    organization,
    processing,
    serviceCosts,
    extraRevenue,
    extraCosts,
    extraContribution,
    residualExtra:
      extraContribution - extra * (f.member + b.fullOrg) - poCount * (f.poMember + b.poOrg),
    contribution,
    used,
    remaining,
    unexpected,
    beforeOverhead,
    net,
    distributable,
    nolan,
    steve: distributable - nolan,
    baselineShortfall: Math.max(0, f.protectedBudget - baselinePlayers * f.allocation),
  };
}
export function paymentStatus(
  total: number,
  paid: number,
  accepted: string,
  second: string,
  final: string,
  today: string,
  b: FeeBudget,
  rosterStatus = "Confirmed",
  schedule?: { amount: number; due: string; label: string }[],
) {
  const amounts = installments(total),
    dates = [accepted, second, final];
  let allocated = Math.max(0, paid);
  const rows = (
    schedule ||
    amounts.map((amount, i) => ({
      label: ["Deposit", "Second payment", "Final payment"][i],
      amount,
      due: dates[i],
    }))
  ).map((r) => {
    const applied = Math.min(allocated, r.amount);
    allocated -= applied;
    return { ...r, paid: applied, remaining: r.amount - applied };
  });
  const overdue = rows.filter((r) => r.remaining > 0 && r.due && r.due < today);
  const earliest = overdue.map((r) => r.due).sort()[0];
  const days = earliest
    ? Math.floor(
        (Date.parse(today + "T12:00:00Z") - Date.parse(earliest + "T12:00:00Z")) / 86400000,
      )
    : 0;
  const balance = Math.max(0, total - paid);
  const status =
    rosterStatus === "Removed"
      ? "Removed"
      : rosterStatus === "Roster Hold"
        ? "Roster Hold"
        : !balance
          ? "Paid in Full"
          : !earliest
            ? rows.some((r) => r.remaining && r.due === today)
              ? "Payment Due"
              : "Current"
            : days <= b.graceDays
              ? "Grace Period"
              : days >= b.holdDays
                ? "At Risk"
                : "Past Due";
  return {
    rows,
    balance,
    status,
    days,
    lateFeeSuggested: days > b.graceDays ? b.lateFee : 0,
    holdEligible: days >= b.holdDays,
    removalEligible: days >= b.removalDays,
    depositPaid: rows[0].remaining === 0,
    uniformReady: rows[0].remaining === 0 && rosterStatus === "Confirmed",
  };
}
export function membershipRecognition(total: number, start: string, end: string, asOf: string) {
  if (!start || !end || end < start) throw Error("Set season dates.");
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1,
    delivered = Math.min(days, Math.max(0, (Date.parse(asOf) - Date.parse(start)) / 86400000 + 1));
  const earned = Math.round((total * delivered) / days);
  return { earned, deferred: total - earned };
}
export function businessProjection(
  teams: ReturnType<typeof project>[],
  fixedOverhead: number,
  reserve: number,
  nolanBps = 5000,
) {
  const contribution = sum(teams.map((t) => t.beforeOverhead)),
    net = contribution - fixedOverhead,
    distributable = Math.max(0, net - reserve),
    nolan = Math.floor((distributable * nolanBps) / 10000);
  return {
    revenue: sum(teams.map((t) => t.totalRevenue)),
    teamOperatingContribution: sum(teams.map((t) => t.teamOperatingContribution)),
    organizationAndProgramRevenue: sum(teams.map((t) => t.organizationAndProgramRevenue)),
    totalTeamAssociatedContribution: sum(teams.map((t) => t.totalTeamAssociatedContribution)),
    membership: sum(teams.map((t) => t.membership)),
    organization: sum(teams.map((t) => t.organization)),
    externalDirect: sum(teams.map((t) => t.externalDirect)),
    programDirect: sum(teams.map((t) => t.programDirect)),
    direct: sum(teams.map((t) => t.direct)),
    contingency: sum(teams.map((t) => t.reserve)),
    contribution,
    overhead: fixedOverhead,
    net,
    distributable,
    nolan,
    steve: distributable - nolan,
  };
}

export function feeComposition(b: FeeBudget, role: "full" | "po") {
  b = withBillableMonths(b);
  const f = calculateFees(b),
    po = role === "po";
  const teamCosts = po
    ? f.poAllocation - f.poContingency - (b.programCostModel === 1 ? f.poMember : 0)
    : f.teamComponent + f.uniformComponent;
  const contingency = po ? f.poContingency : f.contingencyComponent;
  const membership = po ? f.poMember : f.member;
  const organization = po ? b.poOrg : b.fullOrg;
  const processing = po ? f.poProcessing : f.fullProcessing;
  const adjustment = po ? f.poRounding : f.fullRounding;
  const total = po ? f.po : f.full;
  // Standard baseline allocation, not marginal contribution from extra roster spots.
  const contribution =
    total -
    f.allocation +
    (b.programCostModel === 1 ? f.member : 0) -
    processing -
    Math.round(b.serviceCostMonthly * b.months);
  return {
    teamCosts,
    contingency,
    membership,
    organization,
    processing,
    adjustment,
    total,
    contribution,
  };
}

/** Owner-only working draft trace. Component rounding is kept separate from costs. */
export function feeCostTrace(input: FeeBudget) {
  const b = effectiveFeeBudget(budgetSchema.parse(withoutRetiredMembershipPricing(input)));
  const f = calculateFees(b);
  const coachingAndOperations = f.fixed - b.tournament - b.hotelNightly * b.hotelNights;
  return {
    baseline: b.baseline,
    tournamentSource:
      input.tournamentEstimate === undefined ? "schedule / manual budget" : "admin estimate",
    uniformSource: input.uniformEstimate === undefined ? "selected package" : "admin estimate",
    tournament: b.tournament,
    uniformEach: b.uniformCost,
    uniforms: b.uniformCost * b.baseline,
    otherPerPlayer: b.fullIncremental * b.baseline,
    hotels: b.hotelNightly * b.hotelNights,
    coachingAndOperations,
    externalDirect: f.externalDirect,
    programDirect: f.programDirect,
    programInDirect: b.programCostModel === 1,
    direct: f.direct,
    contingency: f.contingency,
    protectedBudget: f.protectedBudget,
    allocation: f.allocation,
    allocationRounding: f.allocation * b.baseline - f.protectedBudget,
  };
}

export function additionalPlayerContribution(
  b: FeeBudget,
  role: "full" | "po",
  costs: { insurance: number; registration: number; other: number },
) {
  b = effectiveFeeBudget(b);
  const f = calculateFees(b);
  const fee = role === "po" ? f.po : f.full;
  const processing = role === "po" ? f.poProcessing : f.fullProcessing;
  const uniform = b.uniformCost;
  const other =
    costs.other +
    (role === "po" && b.poModel !== 2 ? b.poIncremental : b.fullIncremental) +
    Math.round(b.serviceCostMonthly * b.months);
  return {
    fee,
    uniform,
    processing,
    registration: costs.registration,
    insurance: costs.insurance,
    other,
    contribution: fee - uniform - processing - costs.registration - costs.insurance - other,
  };
}
