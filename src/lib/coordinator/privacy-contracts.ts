import { z } from "zod";
export const privacyCategories = [
  "recruiting",
  "communications",
  "operational",
  "publication",
  "audit",
] as const;
export const privacyPolicyInput = z
  .object({
    category: z.enum(privacyCategories),
    revision: z.number().int().nonnegative(),
    purpose: z.string().trim().min(10).max(1000),
    retentionDays: z.number().int().min(1).max(3650),
    legalBasis: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
export const privacyReviewInput = z
  .object({
    id: z.string().uuid(),
    category: z.enum([...privacyCategories, "privacy-flows"]),
    revision: z.number().int().nonnegative(),
    evidence: z.string().trim().min(20).max(2000),
    confirm: z.literal(true),
  })
  .strict();
