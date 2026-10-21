import { z } from "zod";
import { id } from "./contracts";
export const existingCoordinatorInput = z
  .object({
    userId: id,
    sport: z.enum(["baseball", "softball"]),
    independentRolesReviewed: z.boolean(),
    confirm: z.literal(true),
  })
  .strict();
export const coordinatorInvitationInput = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    sport: z.enum(["baseball", "softball"]),
  })
  .strict();
