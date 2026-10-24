import { z } from "zod";
import { servicePresentationInput } from "./service-presentation";

const text = z.string().trim().max(2000);
const id = z.string().trim().min(1).max(120);
const optionalId = z.string().trim().max(120).optional();
const role = z.enum(["parent", "player", "coach", "admin"]);
const password = z.literal("").optional();
const count = z.number().int().min(0).max(10000);
const lines = z.array(z.string().trim().max(500)).max(50);

export const serviceInput = z
  .object({
    presentation: servicePresentationInput.optional(),
    presentationRevision: z.number().int().nonnegative().optional(),
    operationalDraftRevision: z.number().int().positive().optional(),
    operationalDraftConfirmed: z.literal(true).optional(),
    basisVersion: z.number().int().positive().optional(),
    id: optionalId,
    kind: z.enum(["lesson", "package", "membership", "cage", "cage_plan", "fee", "team_plan"]),
    name: z.string().trim().min(1).max(120),
    discipline: text,
    price: z.number().finite().min(0).max(100000).multipleOf(0.01),
    minutes: count,
    purpose: text,
    entry: z.boolean(),
    group_session: z.boolean(),
    requires_assessment: z.boolean(),
    credits: count,
    remote: count,
    expires_days: count,
    hours: count,
    featured: z.boolean(),
    detail: text,
    includes: lines,
    unit: text,
    lanes: text,
    period: text,
    hourly: text,
    bestFor: text,
    savings: text,
    perks: lines,
    active: z.boolean(),
    sort_order: count.optional(),
  })
  .strict();

export const staffInput = z
  .object({
    basisVersion: z.number().int().positive().optional(),
    id: optionalId,
    name: z.string().trim().min(1).max(120),
    email: z.union([z.literal(""), z.string().trim().email().max(254)]),
    phone: z.string().trim().max(40),
    role,
    access_notes: text,
    active: z.boolean(),
    createLogin: z.boolean().optional(),
    password,
    offerings: z
      .array(z.object({ serviceId: id, profitSplit: z.number().int().min(0).max(100) }).strict())
      .max(200)
      .refine(
        (rows) => new Set(rows.map((row) => row.serviceId)).size === rows.length,
        "Choose each service once.",
      )
      .optional(),
  })
  .strict();

export const accountInput = z
  .object({
    userId: optionalId,
    name: z.string().trim().max(120),
    email: z.string().trim().email().max(254),
    role,
    playerName: z.string().trim().max(120),
    password,
  })
  .strict();
export const recordIdInput = z.object({ id }).strict();
export const lessonTermIdInput = z
  .object({ id, basisVersion: z.number().int().positive().optional() })
  .strict();
export const userIdInput = z.object({ userId: id }).strict();
