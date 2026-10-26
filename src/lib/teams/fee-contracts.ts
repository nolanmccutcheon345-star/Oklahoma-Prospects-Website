import { z } from "zod";
import { budgetSchema, expenseSchema, type FeeBudget, type Expense } from "./fee-model";
import type { IndependentInstallment } from "./independent-model";
import {
  independentAdminBudgetSchema,
  type IndependentAdminBudget,
} from "./independent-admin-budget";
const cents = z.number().int().min(0).max(1_000_000_000),
  id = z.string().min(1).max(150);
export const uniformPhotoSchema = z
  .object({
    id: z.string().min(1).max(150),
    caption: z.string().max(120),
    src: z
      .string()
      .max(180000)
      .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type UniformPhoto = z.infer<typeof uniformPhotoSchema>;
export const uniformSchema = z
  .object({
    id,
    name: z.string().min(1).max(120),
    items: z.string().max(1500),
    price: cents,
    cost: cents,
    active: z.boolean(),
    photos: z.array(uniformPhotoSchema).max(4).optional(),
  })
  .strict();
export type FeeUniform = z.infer<typeof uniformSchema>;
export type FeePlan = {
  /** Owner-only worksheet, separate from published budgets and accepted agreements. */
  independentAdmin?: IndependentAdminBudget;
  defaults?: { key: string; revision: number; appliedAt: string };
  budget: FeeBudget;
  uniforms: FeeUniform[];
  status: "draft" | "pending" | "published" | "closed";
  revision: number;
  publishedBudget?: FeeBudget;
  spendingBudget?: { budget: FeeBudget; publishedAt: string; publicationRevision: number };
  published?: {
    full: number;
    po: number;
    schedules?: {
      full: { amount: number; due: string; label: string }[];
      po: { amount: number; due: string; label: string }[];
    };
    secondDue: string;
    finalDue: string;
    policy: string;
    at: string;
    revision: number;
  };
  expenses: Expense[];
  independentCancellation?: { at: string; reason: string; actorId: string };
  players: Record<
    string,
    {
      status: "Invited" | "Confirmed" | "Roster Hold" | "Removed";
      note: string;
      acceptedPolicy?: string;
      uniformReleasedAt?: string;
      membershipAllocation?: number;
      organizationAllocation?: number;
      // Read-only allocation retained on previously accepted agreements.
      accessAllocation?: number;
      contingencyAllocation?: number;
      serviceStart?: string;
      serviceEnd?: string;
      latePolicy?: { fee: number; grace: number; hold: number; removal: number; bps?: 2000 };
      automaticPayments?: true;
      acceptedFeeCents?: number;
      acceptedSchedule?: { date: string; amountCents: number }[];
      independent?: {
        seasonKey: string;
        payerUserId: string;
        version: number;
        installments: IndependentInstallment[];
        agreements: {
          version: number;
          publicationRevision: number;
          actorId: string;
          name: string;
          at: string;
          policy: string;
          installments: IndependentInstallment[];
        }[];
        offer?: { budget: FeeBudget; reason: string; revision: number; payerUserId: string };
        uniformCommitted?: { at: string; reference: string; actorId: string };
        cancellation?: { at: string; reason: string; actorId: string; originalTotal: number };
      };
      lateFeeInstallments?: { index: number; cents: number; baseCents: number; at: string }[];
      lateFeeApplied?: number;
    }
  >;
  history: { at: string; actor: string; action: string }[];
};
export const feeAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("independentAdminBudget"),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      adminBudget: independentAdminBudgetSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("publishIndependent"),
      adminBudget: independentAdminBudgetSchema.optional(),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      budget: budgetSchema,
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("independentOffer"),
      adminBudget: independentAdminBudgetSchema.optional(),
      teamId: id,
      playerId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      budget: budgetSchema,
      payerUserId: id,
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("independentWithdraw"),
      teamId: id,
      playerId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("independentSeasonCancel"),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      reason: z.string().trim().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("independentUniform"),
      teamId: id,
      playerId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      reference: z.string().trim().min(5).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("applyDefaults"),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      key: z.string().max(100),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("playerRole"),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      playerId: id,
      role: z.enum(["full", "po"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      adminBudget: independentAdminBudgetSchema.optional(),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      budget: budgetSchema,
      uniforms: z
        .array(uniformSchema)
        .max(100)
        .refine(
          (rows) =>
            rows.reduce(
              (total, u) => total + (u.photos || []).reduce((n, p) => n + p.src.length, 0),
              0,
            ) <= 3000000,
          "Uniform photos exceed the save limit. Remove unused photos or use smaller images.",
        ),
      expenses: z.array(expenseSchema).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("propose"),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      tournament: cents,
      uniformId: z.string().max(100),
    })
    .strict(),
  z
    .object({
      action: z.enum(["publish", "close"]),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("roster"),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      playerId: id,
      status: z.enum(["Invited", "Confirmed", "Roster Hold", "Removed"]),
      note: z.string().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("releaseUniform"),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      playerId: id,
    })
    .strict(),
  z
    .object({
      action: z.literal("lateFee"),
      installmentIndex: z.number().int().min(0).max(12).optional(),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      playerId: id,
    })
    .strict(),
  z
    .object({
      action: z.literal("accept"),
      independentOfferDigest: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      teamId: id,
      revision: z.number().int(),
      basisVersion: z.number().int().positive().optional(),
      playerId: id,
      consent: z.literal(true),
      name: z.string().trim().min(3).max(150),
    })
    .strict(),
]);
export const businessSchema = z
  .object({
    overhead: cents,
    reserve: cents,
    nolanBps: z.number().int().min(0).max(10000),
    period: z.string().max(120),
    teamIds: z.array(id).max(200),
  })
  .strict();
export type FeeBusiness = z.infer<typeof businessSchema>;

const financialEventFields = {
  teamId: id,
  activityId: z.string().uuid(),
  basisVersion: z.number().int().positive(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(value + "T12:00:00Z");
      return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
    }, "Choose a valid financial commitment date."),
  status: z.enum(["scheduled", "live", "final", "cancelled"]),
  entryFee: z.number().int().min(0).max(100000000),
  travel: z.enum(["local", "travel"]),
  overnightNights: z.number().int().min(0).max(30),
  reason: z.string().trim().min(1).max(1000),
};
export const financialEventAmendment = z
  .object({
    ...financialEventFields,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export const financialEventAdmission = z
  .object({
    ...financialEventFields,
    sourceRevision: z.number().int().nonnegative(),
    confirmed: z.literal(true),
  })
  .strict();
