import { z } from "zod";
export const cents = z.number().int().min(0).max(1_000_000_000);
const signed = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const id = z.string().trim().min(1).max(180);
// Free-text financial instructions cannot be a place to paste banking credentials.
export const safeText = z
  .string()
  .trim()
  .max(500)
  .refine(
    (s) => !/(?:\d[ -]?){9,}/.test(s),
    "Use a masked reference only; never enter account/card numbers.",
  );
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  }, "Use a valid date.");
export const category = z.enum([
  "coach",
  "instructor",
  "owner",
  "staff",
  "vendor",
  "uniform",
  "tournament",
  "hotel",
  "gas",
  "facility",
  "refund",
  "other",
]);
export type Category = z.infer<typeof category>;
export const accountSchema = z
  .object({
    id,
    bank: safeText,
    nickname: safeText,
    type: z.enum(["checking", "savings", "other"]),
    last4: z.string().regex(/^\d{4}$/),
    active: z.boolean(),
    opening: signed,
    openingDate: day,
  })
  .strict();
export const cardSchema = z
  .object({
    id,
    accountId: id,
    nickname: safeText,
    brand: safeText,
    last4: z.string().regex(/^\d{4}$/),
    active: z.boolean(),
    isDefault: z.boolean(),
  })
  .strict();
export const payeeSchema = z
  .object({
    id,
    name: safeText,
    email: z.string().email().or(z.literal("")),
    role: z.enum([
      "Nolan",
      "Steve",
      "Head Coach",
      "Assistant Coach",
      "Instructor",
      "Employee",
      "Contractor",
      "Vendor",
      "Other",
    ]),
    method: z.enum(["bank transfer", "check", "business debit", "other"]),
    reference: safeText,
    active: z.boolean(),
  })
  .strict();
export const payableSchema = z
  .object({
    id,
    payeeId: id,
    category,
    teamId: z.string().max(150),
    reason: safeText,
    amount: cents,
    earned: cents,
    due: day,
    source: z.string().max(250).default("manual"),
  })
  .strict()
  .refine((p) => p.earned <= p.amount, "Earned cannot exceed the compensation budget.");
export type Payable = z.infer<typeof payableSchema> & {
  approved: number;
  paid: number;
  state: "accrued" | "pending approval" | "approved" | "held" | "failed" | "canceled";
  source?: string;
  gross?: number;
  adjustment?: number;
  legacyPaid?: boolean;
  manualOverride?: boolean;
};
export const bankSchema = z
  .object({
    id,
    accountId: id,
    date: day,
    amount: signed.refine((n) => n !== 0),
    reference: safeText.refine((s) => s.length > 0),
    category: safeText,
    reason: safeText,
    payeeId: z.string().max(180),
    teamId: z.string().max(150),
  })
  .strict();
export type BankTxn = z.infer<typeof bankSchema> & { match?: string; verified?: boolean };
export type Payment = {
  id: string;
  payableId: string;
  accountId: string;
  cardId: string;
  amount: number;
  date: string;
  reference: string;
  method: string;
  state: "in progress" | "reconciled" | "failed";
  bankId?: string;
};
export const invoiceSchema = z
  .object({
    id,
    customer: safeText,
    userId: z.string().max(150),
    category: safeText,
    teamId: z.string().max(150),
    amount: cents,
    due: day,
    reason: safeText,
  })
  .strict();
export const ruleSchema = z
  .object({
    id,
    payeeId: id,
    serviceId: id,
    effectiveFrom: day,
    mode: z.enum(["percent", "fixed", "hourly"]),
    value: cents,
  })
  .strict()
  .refine((r) => r.mode !== "percent" || r.value <= 10000, "Percentage must be 0–100%.");
export const settingsSchema = z
  .object({
    profit: cents,
    reserve: cents,
    tax: cents,
    restricted: cents,
    nolanBps: z.number().int().min(0).max(10000),
    reviewedThrough: day.or(z.literal("")),
    reviewNote: safeText,
    cadence: z.enum(["manual", "monthly", "biweekly", "quarterly", "custom"]),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
const base = {
  basisVersion: z.number().int().positive().optional(),
  revision: z.number().int().nonnegative(),
  reason: safeText.refine((s) => s.length >= 5, "Explain this financial change."),
};
export const financeAction = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("recognizeLesson"), bookingId: id }).strict(),
  z.object({ ...base, action: z.literal("facility") }).strict(),
  z
    .object({
      ...base,
      action: z.literal("invoiceAdjustment"),
      invoiceId: id,
      amount: cents,
      kind: z.enum(["credit", "write-off"]),
    })
    .strict(),
  z.object({ ...base, action: z.literal("legacyMatch"), payableId: id, bankId: id }).strict(),
  z.object({ ...base, action: z.literal("account"), value: accountSchema }).strict(),
  z.object({ ...base, action: z.literal("card"), value: cardSchema }).strict(),
  z.object({ ...base, action: z.literal("payee"), value: payeeSchema }).strict(),
  z.object({ ...base, action: z.literal("payable"), value: payableSchema }).strict(),
  z.object({ ...base, action: z.literal("bank"), value: bankSchema }).strict(),
  z.object({ ...base, action: z.literal("invoice"), value: invoiceSchema }).strict(),
  z.object({ ...base, action: z.literal("rule"), value: ruleSchema }).strict(),
  z.object({ ...base, action: z.literal("settings"), value: settingsSchema }).strict(),
  z.object({ ...base, action: z.literal("refresh") }).strict(),
  z
    .object({
      ...base,
      action: z.literal("approve"),
      ids: z.array(id).min(1).max(100),
      total: cents,
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("hold"),
      id,
      state: z.enum(["held", "canceled", "pending approval"]),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("payment"),
      id,
      payableId: id,
      accountId: id,
      cardId: z.string().max(180),
      amount: cents.refine((n) => n > 0),
      date: day,
      reference: safeText.refine((s) => s.length > 0),
      method: safeText,
    })
    .strict(),
  z.object({ ...base, action: z.literal("paymentFailed"), id }).strict(),
  z
    .object({
      ...base,
      action: z.literal("match"),
      bankId: id,
      targetId: id,
      targetKind: z.enum(["payment", "settlement", "invoice", "classification"]),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("distribution"),
      amount: cents.refine((n) => n > 0),
      due: day,
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal("externalRefund"),
      refundId: id,
      payeeId: id,
      due: day,
      providerFailureConfirmed: z.literal(true),
    })
    .strict(),
]);
export type FinanceAction = z.infer<typeof financeAction>;
export type RecordRow = { id: string; kind: string; payload: Record<string, any> };
export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function accrual(amount: number, start: string, end: string, asOf: string) {
  const a = Date.parse(start + "T00:00:00Z"),
    b = Date.parse(end + "T00:00:00Z"),
    n = Date.parse(asOf + "T00:00:00Z");
  if (![a, b, n].every(Number.isFinite) || b < a) return 0;
  return Math.floor(amount * Math.max(0, Math.min(1, (n - a + 86400000) / (b - a + 86400000))));
}
export function compensation(mode: string, value: number, gross: number, minutes: number) {
  return mode === "fixed"
    ? value
    : mode === "hourly"
      ? Math.round((value * minutes) / 60)
      : Math.round((gross * value) / 10000);
}
export function payableStatus(p: Payable, date: string, inProgress = 0) {
  if (p.state === "canceled") return "CANCELED";
  if (p.state === "held") return "PENDING APPROVAL";
  if (p.paid >= p.earned && p.earned > 0) return "PAID";
  if (inProgress) return "PAYMENT IN PROGRESS";
  if (p.state === "failed") return "FAILED";
  if (p.due < date && p.earned > p.paid) return "OVERDUE";
  if (p.approved > p.paid) return "APPROVED";
  if (p.state === "pending approval") return "PENDING APPROVAL";
  if (p.due > date) return "NOT YET DUE";
  if (p.due === date) return "DUE";
  return "ACCRUED";
}
