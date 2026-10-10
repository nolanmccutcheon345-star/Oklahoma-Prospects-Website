import { z } from "zod";
import { availabilityInput } from "./coaching-contracts";
const photo = z.union([
  z.literal(""),
  z
    .string()
    .max(250000)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  z
    .url()
    .max(2000)
    .refine((v) => v.startsWith("https://"), "Use an HTTPS image URL."),
]);
export const sharedProfileInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    photo,
    bio: z.string().trim().max(3000),
    sports: z.array(z.enum(["baseball", "softball"])).max(2),
    specialties: z.array(z.string().trim().min(1).max(60)).max(8),
    ages: z.string().trim().max(500),
    approach: z.string().trim().max(2000),
    achievements: z.string().trim().max(2000),
    welcome: z.string().trim().max(1000),
  })
  .strict();
export type SharedProfile = z.infer<typeof sharedProfileInput>;
export const personSaveInput = z
  .object({
    userId: z.string().min(1).max(200),
    revision: z.number().int().min(0),
    profile: sharedProfileInput,
    instructor: z.boolean(),
    publishCoach: z.boolean(),
    publishInstructor: z.boolean(),
    teams: z
      .array(
        z
          .object({ teamId: z.string().min(1).max(150), role: z.string().trim().min(1).max(80) })
          .strict(),
      )
      .max(100),
    offerings: z
      .array(
        z
          .object({
            serviceId: z.string().min(1).max(150),
            profitSplit: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .max(100),
    windows: availabilityInput.shape.windows,
    guardianHouseholds: z.array(z.string().min(1).max(200)).max(100),
    playerIds: z.array(z.string().min(1).max(200)).max(100),
    reviewedSources: z.boolean(),
  })
  .strict();
export const ownProfileInput = z
  .object({
    revision: z.number().int().min(0),
    profile: sharedProfileInput,
    reviewedSources: z.boolean(),
  })
  .strict();
export type PersonSave = z.infer<typeof personSaveInput>;
export type PublicPerson = SharedProfile & {
  id: string;
  coachId: string;
  instructor: boolean;
  bookable: boolean;
  serviceIds: string[];
  teams: { id: string; name: string; role: string; sport: string; seasons: string[] }[];
};
export const emptySharedProfile = (name = ""): SharedProfile => ({
  name,
  photo: "",
  bio: "",
  sports: [],
  specialties: [],
  ages: "",
  approach: "",
  achievements: "",
  welcome: "",
});
export const normEmail = (email: string) => email.trim().toLowerCase();
