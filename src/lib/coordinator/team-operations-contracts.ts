import { z } from "zod";
import { id } from "./contracts";
const base = z.object({ teamId: id, revision: z.number().int().nonnegative() });
export const teamOperationsInput = z.discriminatedUnion("field", [
  base.extend({ field: z.literal("openings"), value: z.number().int().min(0).max(100) }).strict(),
  base.extend({ field: z.literal("needs"), value: z.string().trim().max(1000) }).strict(),
]);
