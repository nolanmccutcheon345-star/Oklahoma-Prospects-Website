import { z } from "zod";
export const financialCaptureInput = z
  .object({
    sourceClubRevision: z.number().int().nonnegative(),
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export const financialRefreshInput = financialCaptureInput
  .extend({
    expectedVersion: z.number().int().positive(),
    readinessDigest: z.string().regex(/^[a-f0-9]{64}$/),
    reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
