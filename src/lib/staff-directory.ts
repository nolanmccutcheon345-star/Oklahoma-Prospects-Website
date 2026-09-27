import { z } from "zod";

export const staffListingInput = z
  .object({
    id: z.uuid(),
    version: z.number().int().min(0),
    name: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    program: z.enum(["Baseball", "Softball", "Organization"]),
    email: z.email().trim().toLowerCase().max(254),
    phone: z
      .string()
      .trim()
      .max(40)
      .refine(
        (value) => !value || /^\+?[\d\s().-]{7,40}$/.test(value),
        "Enter a valid phone number.",
      ),
    bio: z.string().trim().max(3000),
    published: z.boolean(),
  })
  .strict();
export type StaffListing = z.infer<typeof staffListingInput>;
export type PublicStaffListing = Omit<StaffListing, "version" | "published">;
