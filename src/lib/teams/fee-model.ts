import { z } from "zod";

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
export const budgetSchema = z
  .object({
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
    tournament: cents,
    uniformId: z.string().max(100),
    uniformCost: cents,
    fullIncremental: cents,
    poIncremental: cents,
    poSharedAllocation: cents,
    serviceCostMonthly: cents,
    processingBps: z.number().int().min(0).max(2000),
    processingFixed: cents,
    overhead: cents,
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
    uniformCutoff: day,
    graceDays: z.number().int().min(0).max(365),
    holdDays: z.number().int().min(1).max(365),
    removalDays: z.number().int().min(1).max(730),
    lateFee: cents,
    policy: z.string().max(10000),
    reinstatement: z.string().max(3000),
    coachTournament: z.boolean(),
    coachUniform: z.boolean(),
  })
  .strict();
export type FeeBudget = z.infer<typeof budgetSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export const defaultBudget = (): FeeBudget => ({
  start: "",
  end: "",
  months: 3,
  baseline: 10,
  membershipMonthly: 20000,
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
  policy: "",
  reinstatement: "",
  coachTournament: true,
  coachUniform: true,
});
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
export function deadline(b: FeeBudget, events: { id: string; start: string }[]) {
  const first = events.filter((e) => e.start).sort((a, b) => a.start.localeCompare(b.start))[0];
  const chosen = b.paymentSchedule ? first : events.find((e) => e.id === b.triggerEventId) || first;
  return (
    b.deadlineOverride ||
    (chosen ? shiftDay(chosen.start.slice(0, 10), -(b.daysBeforeTournament ?? 28)) : "")
  );
}
export function scheduleRows(
  b: FeeBudget,
  total: number,
  role: "full" | "po",
  final: string,
  accepted = "",
) {
  if (!b.paymentSchedule)
    return installments(total).map((amount, i) => ({
      amount,
      due: [accepted, b.secondDue, final][i],
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
// Processing allowance follows the configured payment count, including per-charge rounding.
function gross(net: number, b: FeeBudget) {
  const count = b.paymentSchedule?.rows.length || 3;
  let total = Math.ceil((net + count * b.processingFixed) / (1 - b.processingBps / 10000));
  if (!b.paymentSchedule) {
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
export function calculateFees(input: FeeBudget) {
  const b = budgetSchema.parse(input);
  const fixed = sum(b.costs.map((c) => c.cents)) + b.tournament;
  const each = b.uniformCost + b.fullIncremental,
    direct = fixed + b.baseline * each,
    contingency = Math.ceil((direct * b.contingencyBps) / 10000),
    protectedBudget = direct + contingency;
  const member = Math.round(b.membershipMonthly * b.months),
    allocation = Math.ceil(protectedBudget / b.baseline);
  const fullNet = allocation + member + b.fullOrg;
  const poDirect = b.poSharedAllocation + b.uniformCost + b.poIncremental,
    poContingency = Math.ceil((poDirect * b.contingencyBps) / 10000);
  const poNet = poDirect + poContingency + member + b.poOrg;
  const full = gross(fullNet, b),
    po = gross(poNet, b);
  return {
    fixed,
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
    fullProcessing: full - fullNet,
    poProcessing: po - poNet,
  };
}
export function project(
  b: FeeBudget,
  fullCount: number,
  poCount: number,
  expenses: Expense[] = [],
  closed = false,
) {
  for (const n of [fullCount, poCount])
    if (!Number.isInteger(n) || n < 0 || n > 500) throw Error("Invalid roster count.");
  const f = calculateFees(b),
    baselinePlayers = Math.min(fullCount, b.baseline),
    extra = Math.max(0, fullCount - b.baseline);
  const service = Math.round(b.serviceCostMonthly * b.months),
    extraRevenue = extra * f.full + poCount * f.po;
  const extraCosts =
    extra * (b.uniformCost + b.fullIncremental + service + f.fullProcessing) +
    poCount * (b.uniformCost + b.poIncremental + service + f.poProcessing);
  const reserve = f.contingency + poCount * f.poContingency;
  const direct =
    f.fixed +
    fullCount * (b.uniformCost + b.fullIncremental) +
    poCount * (b.uniformCost + b.poIncremental);
  const totalRevenue = fullCount * f.full + poCount * f.po,
    membership = (fullCount + poCount) * f.member,
    organization = fullCount * b.fullOrg + poCount * b.poOrg;
  const processing = fullCount * f.fullProcessing + poCount * f.poProcessing,
    serviceCosts = (fullCount + poCount) * service;
  const contribution = totalRevenue - direct - reserve - processing - serviceCosts;
  const used = sum(expenses.filter((e) => e.contingency).map((e) => e.cents)),
    remaining = Math.max(0, reserve - used);
  const unexpected = Math.max(0, used - reserve);
  const beforeOverhead = contribution - unexpected + (closed ? remaining : 0),
    net = beforeOverhead - b.overhead,
    distributable = Math.max(0, net - b.reserve);
  const nolan = Math.floor((distributable * b.nolanBps) / 10000);
  // Additional contribution already contains its membership and org allocations.
  // To reconcile all-player membership/org totals, use residualExtra, not extraContribution.
  const extraContribution = extraRevenue - extraCosts - poCount * f.poContingency;
  return {
    ...f,
    fullCount,
    poCount,
    baselinePlayers,
    extra,
    totalRevenue,
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
      extraContribution - extra * (f.member + b.fullOrg) - poCount * (f.member + b.poOrg),
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
    membership: sum(teams.map((t) => t.membership)),
    organization: sum(teams.map((t) => t.organization)),
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
