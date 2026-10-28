import { z } from "zod";
export const independentCapabilities = [
  "view",
  "budget",
  "dues",
  "payments",
  "expenses",
  "corrections",
  "share",
  "export",
  "closeout",
] as const;
export type IndependentCapability = (typeof independentCapabilities)[number];
export const categoryNames = {
  tournaments: "Tournaments",
  fields: "Fields",
  equipment: "Equipment",
  coaching: "Coaching",
  fundraising: "Fundraising",
  sponsorships: "Sponsorships",
  other: "Other team costs",
} as const;
const category = z.enum([
  "tournaments",
  "fields",
  "equipment",
  "coaching",
  "fundraising",
  "sponsorships",
  "other",
]);
const cents = z.number().int().min(1).max(100_000_000);
const id = z.string().min(1).max(150),
  uuid = z.string().uuid();
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      Number.isFinite(Date.parse(s + "T12:00:00Z")) &&
      new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s,
    "Use a valid date.",
  );
export const independentSettingsSchema = z
  .object({
    categories: z
      .array(z.object({ category, budget: cents.or(z.literal(0)) }).strict())
      .max(7)
      .refine(
        (rows) => new Set(rows.map((r) => r.category)).size === rows.length,
        "Duplicate category.",
      ),
    policy: z.string().max(10000),
    instructions: z.string().max(3000),
    shared: z.boolean(),
    closed: z.boolean(),
    closing: z.boolean().optional(),
  })
  .strict();
export type IndependentSettings = z.infer<typeof independentSettingsSchema>;
const common = { date: day, amount: cents, category, note: z.string().trim().min(1).max(2000) };
const external = {
  method: z.string().trim().min(1).max(100),
  reference: z.string().trim().min(1).max(300),
};
export const independentEntrySchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("obligation"), playerId: id, due: day }).strict(),
  z.object({ ...common, ...external, kind: z.literal("payment"), payerUserId: id }).strict(),
  z
    .object({
      ...common,
      ...external,
      kind: z.enum(["income", "expense"]),
      commitmentId: uuid.optional(),
    })
    .strict(),
  z.object({ ...common, kind: z.literal("commitment") }).strict(),
  z
    .object({ ...common, kind: z.literal("allocation"), paymentId: uuid, obligationId: uuid })
    .strict(),
  z.object({ ...common, kind: z.enum(["credit", "unallocate"]), targetId: uuid }).strict(),
  z
    .object({
      ...common,
      ...external,
      kind: z.literal("refund"),
      paymentId: uuid,
      plannedId: uuid.optional(),
    })
    .strict(),
  z.object({ ...common, kind: z.literal("plannedRefund"), paymentId: uuid }).strict(),
  z.object({ ...common, kind: z.literal("reversal"), targetId: uuid }).strict(),
  z.object({ ...common, kind: z.literal("reminder"), playerId: id, recipientId: id }).strict(),
]);
export type IndependentEntry = z.infer<typeof independentEntrySchema>;
export type CarryEntry = {
  kind: "carryIn" | "carryOut";
  date: string;
  amount: number;
  category: keyof typeof categoryNames;
  note: string;
  peerSeasonId: string;
  transferId: string;
  method: string;
  reference: string;
  mode: "bookkeeping" | "external";
};
export type LedgerRow = {
  id: string;
  payload: IndependentEntry | CarryEntry;
  actor_id: string;
  actor_role: string;
  created_at: string;
};
export const independentActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("settings"),
      seasonId: uuid,
      revision: z.number().int().nonnegative(),
      settings: independentSettingsSchema,
      reason: z.string().trim().min(5).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("entry"),
      seasonId: uuid,
      requestId: uuid,
      entry: independentEntrySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("grant"),
      seasonId: uuid,
      userId: id,
      capabilities: z.array(z.enum(independentCapabilities)).max(9),
      revoke: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("document"),
      seasonId: uuid,
      entryId: uuid,
      requestId: uuid,
      filename: z.string().min(1).max(120),
      mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      body: z
        .string()
        .max(2_800_000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("carry"),
      seasonId: uuid,
      destinationId: uuid,
      requestId: uuid,
      amount: cents,
      category,
      date: day,
      note: z.string().trim().min(10).max(2000),
      mode: z.enum(["bookkeeping", "external"]),
      ...external,
    })
    .strict(),
]);

export function independentLedger(rows: LedgerRow[], settings: IndependentSettings) {
  const reversed = new Set(
    rows
      .filter((r) => r.payload.kind === "reversal")
      .map((r) => (r.payload as Extract<IndependentEntry, { kind: "reversal" }>).targetId),
  );
  const active = rows.filter((r) => !reversed.has(r.id) && r.payload.kind !== "reversal");
  const sum = (kinds: string[]) =>
    active.filter((r) => kinds.includes(r.payload.kind)).reduce((s, r) => s + r.payload.amount, 0);
  const allocations = active
    .filter((r) => r.payload.kind === "allocation")
    .map((row) => {
      const p = row.payload as Extract<IndependentEntry, { kind: "allocation" }>;
      const undone = active
        .filter((r) => r.payload.kind === "unallocate" && r.payload.targetId === row.id)
        .reduce((s, r) => s + r.payload.amount, 0);
      return {
        id: row.id,
        paymentId: p.paymentId,
        obligationId: p.obligationId,
        amount: p.amount - undone,
      };
    });
  const obligations = active
    .filter((r) => r.payload.kind === "obligation")
    .map((r) => {
      const p = r.payload as Extract<IndependentEntry, { kind: "obligation" }>;
      const applied = allocations
        .filter((a) => a.obligationId === r.id)
        .reduce((s, a) => s + a.amount, 0);
      const credits = active
        .filter((a) => a.payload.kind === "credit" && a.payload.targetId === r.id)
        .reduce((s, a) => s + a.payload.amount, 0);
      return {
        id: r.id,
        playerId: p.playerId,
        due: p.due,
        amount: p.amount,
        applied,
        credits,
        outstanding: p.amount - applied - credits,
        category: p.category,
        note: p.note,
      };
    });
  const payments = active
    .filter((r) => r.payload.kind === "payment")
    .map((r) => {
      const p = r.payload as Extract<IndependentEntry, { kind: "payment" }>;
      const applied = allocations
        .filter((a) => a.paymentId === r.id)
        .reduce((s, a) => s + a.amount, 0);
      const refunded = active
        .filter((a) => a.payload.kind === "refund" && a.payload.paymentId === r.id)
        .reduce((s, a) => s + a.payload.amount, 0);
      return {
        id: r.id,
        payerUserId: p.payerUserId,
        amount: p.amount,
        applied,
        refunded,
        unapplied: p.amount - applied - refunded,
      };
    });
  const commitments = active
    .filter((r) => r.payload.kind === "commitment")
    .map((r) => ({
      id: r.id,
      category: r.payload.category,
      amount: r.payload.amount,
      remaining:
        r.payload.amount -
        active
          .filter((a) => a.payload.kind === "expense" && a.payload.commitmentId === r.id)
          .reduce((s, a) => s + a.payload.amount, 0),
    }));
  const funds = sum(["payment", "income", "carryIn"]) - sum(["expense", "refund", "carryOut"]);
  const committed = commitments.reduce((s, c) => s + c.remaining, 0);
  const categories = Object.entries(categoryNames).map(([key, name]) => {
    const byKind = (kinds: string[]) =>
      active
        .filter((r) => r.payload.category === key && kinds.includes(r.payload.kind))
        .reduce((s, r) => s + r.payload.amount, 0);
    const budget = settings.categories.find((c) => c.category === key)?.budget || 0;
    const spent = byKind(["expense"]),
      committed = commitments
        .filter((c) => c.category === key)
        .reduce((s, c) => s + c.remaining, 0);
    // Allocating cash reclassifies its category; it never creates another receipt.
    const cashReclassification = allocations.reduce((s, allocation) => {
      const receipt = active.find((r) => r.id === allocation.paymentId),
        obligation = active.find((r) => r.id === allocation.obligationId);
      return (
        s +
        (obligation?.payload.category === key ? allocation.amount : 0) -
        (receipt?.payload.category === key ? allocation.amount : 0)
      );
    }, 0);
    return {
      key,
      name,
      budget,
      spent,
      committed,
      budgetRemaining: budget - spent - committed,
      received: byKind(["payment", "income"]) + cashReclassification,
      funds:
        byKind(["payment", "income", "carryIn"]) +
        cashReclassification -
        spent -
        byKind(["refund", "carryOut"]),
    };
  });
  const plannedRefunds = active
    .filter((r) => r.payload.kind === "plannedRefund")
    .map((r) => ({
      ...r,
      remaining:
        r.payload.amount -
        active
          .filter((a) => a.payload.kind === "refund" && a.payload.plannedId === r.id)
          .reduce((s, a) => s + a.payload.amount, 0),
    }))
    .filter((r) => r.remaining > 0);
  return {
    active,
    obligations,
    payments,
    allocations,
    commitments,
    categories,
    funds,
    committed,
    available: funds - committed,
    spendable: funds - committed - payments.reduce((s, p) => s + p.unapplied, 0),
    outstanding: obligations.reduce((s, o) => s + o.outstanding, 0),
    unapplied: payments.reduce((s, p) => s + p.unapplied, 0),
    received: sum(["payment", "income"]),
    spent: sum(["expense"]),
    refunded: sum(["refund"]),
    plannedRefunds,
  };
}

export const entryCapability = (kind: IndependentEntry["kind"]): IndependentCapability =>
  ["obligation"].includes(kind)
    ? "dues"
    : ["payment", "income", "allocation"].includes(kind)
      ? "payments"
      : ["expense", "commitment"].includes(kind)
        ? "expenses"
        : kind === "reminder"
          ? "share"
          : "corrections";
