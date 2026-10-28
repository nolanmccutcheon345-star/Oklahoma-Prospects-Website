import { z } from "zod";
export const operationalInstructionInput = z
  .object({
    userId: z.string().trim().min(1).max(200),
    revision: z.number().int().min(0),
    active: z.boolean(),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();
export type OperationalInstructionInput = z.infer<typeof operationalInstructionInput>;
