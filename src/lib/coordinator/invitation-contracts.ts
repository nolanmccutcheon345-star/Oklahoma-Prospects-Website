import { z } from "zod";
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
