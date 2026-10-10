import { z } from "zod";
import { budgetSchema, expenseSchema, type FeeBudget, type Expense } from "./fee-model";
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
  budget: FeeBudget;
  uniforms: FeeUniform[];
  status: "draft" | "pending" | "published" | "closed";
  revision: number;
  publishedBudget?: FeeBudget;
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
  players: Record<
    string,
    {
      status: "Invited" | "Confirmed" | "Roster Hold" | "Removed";
      note: string;
      acceptedPolicy?: string;
      uniformReleasedAt?: string;
      membershipAllocation?: number;
      contingencyAllocation?: number;
      serviceStart?: string;
      serviceEnd?: string;
      latePolicy?: { fee: number; grace: number; hold: number; removal: number };
      lateFeeApplied?: number;
    }
  >;
  history: { at: string; actor: string; action: string }[];
};
export const feeAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("playerRole"),
      teamId: id,
      revision: z.number().int(),
      playerId: id,
      role: z.enum(["full", "po"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      teamId: id,
      revision: z.number().int(),
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
      tournament: cents,
      uniformId: z.string().max(100),
    })
    .strict(),
  z
    .object({
      action: z.enum(["publish", "close"]),
      teamId: id,
      revision: z.number().int(),
      confirmed: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("roster"),
      teamId: id,
      revision: z.number().int(),
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
      playerId: id,
    })
    .strict(),
  z
    .object({ action: z.literal("lateFee"), teamId: id, revision: z.number().int(), playerId: id })
    .strict(),
  z
    .object({
      action: z.literal("accept"),
      teamId: id,
      revision: z.number().int(),
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
