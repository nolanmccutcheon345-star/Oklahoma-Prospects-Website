import { z } from "zod";
import { sports } from "./contracts";
export const staffActivityInput = z
  .object({
    actor: z.string().max(200).optional(),
    sport: z.enum(sports).optional(),
    teamId: z.string().max(200).optional(),
    after: z.iso.datetime().optional(),
    before: z.iso.datetime().optional(),
    action: z.string().max(200).optional(),
    targetId: z.string().max(200).optional(),
    result: z.enum(["allowed", "denied", "conflict"]).optional(),
    beforeId: z.number().int().positive().optional(),
  })
  .strict();
export type StaffActivityFilter = z.infer<typeof staffActivityInput>;
