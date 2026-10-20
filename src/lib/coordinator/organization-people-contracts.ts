import { z } from "zod";
import { sharedProfileInput } from "../person-contracts";
import { availabilityInput } from "../coaching-contracts";
export const organizationPersonKey = z.object({ userId: z.string().min(1).max(200) }).strict();
export const organizationPersonInput = organizationPersonKey
  .extend({
    revision: z.number().int().nonnegative(),
    profileRevision: z.number().int().nonnegative(),
    sourceRevision: z.number().int().nonnegative(),
    contactEmail: z.union([z.literal(""), z.email().trim().toLowerCase().max(254)]),
    phone: z
      .string()
      .trim()
      .max(40)
      .refine((v) => !v || /^\+?[\d\s().-]{7,40}$/.test(v), "Enter a valid phone number."),
    active: z.boolean(),
    profile: sharedProfileInput.nullable(),
    publishCoach: z.boolean(),
    publishInstructor: z.boolean(),
    windows: availabilityInput.shape.windows,
    unavailableServiceIds: z.array(z.string().min(1).max(150)).max(100),
    reviewedPublication: z.boolean(),
  })
  .strict()
  .refine(
    (v) => new Set(v.unavailableServiceIds).size === v.unavailableServiceIds.length,
    "Choose each service once.",
  );
export type OrganizationPersonInput = z.infer<typeof organizationPersonInput>;
