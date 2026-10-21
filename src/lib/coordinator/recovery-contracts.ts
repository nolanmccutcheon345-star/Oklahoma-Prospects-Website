import { z } from "zod";
export const recoveryPreviewInput = z.object({ auditId: z.number().int().positive() }).strict();
export const recoveryApplyInput = recoveryPreviewInput
  .extend({
    sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(10).max(1000),
    confirm: z.literal(true),
  })
  .strict();
