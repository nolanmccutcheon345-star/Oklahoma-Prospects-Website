import { z } from "zod";
import { validDate } from "../scheduling";
export const facilityBlockInput = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(2).max(140),
    date: z.string().refine(validDate),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    duration: z.number().int().min(30).max(180).multipleOf(30),
    laneIds: z
      .array(z.enum(["1", "2", "3-4", "5", "6", "7"]))
      .min(1)
      .max(6),
  })
  .strict()
  .refine((v) => new Set(v.laneIds).size === v.laneIds.length, "Choose each space once.");
export const cancelFacilityBlockInput = z.object({ id: z.uuid() }).strict();
export type FacilityBlockInput = z.infer<typeof facilityBlockInput>;
