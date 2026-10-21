import { z } from "zod";
import { id, sports } from "./contracts";
export const resetCoordinatorInput = z
  .object({
    userId: id,
    assignments: z
      .array(z.object({ sport: z.enum(sports), revision: z.number().int().positive() }).strict())
      .max(2),
    legacyRevision: z.number().int().nonnegative(),
    reason: z.string().trim().min(10).max(500),
    confirmed: z.literal(true),
  })
  .strict();
