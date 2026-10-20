import { z } from "zod";
const id = z.string().min(1).max(150),
  revision = z.number().int().nonnegative(),
  reason = z.string().trim().min(5).max(1000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time = z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/),
  coaches = z
    .array(id)
    .min(1)
    .max(20)
    .refine((v) => new Set(v).size === v.length, "Choose each instructor once.");
export const operationalEventCreateInput = z
  .object({
    requestId: z.string().uuid(),
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(5000),
    type: z.enum([
      "camp",
      "clinic",
      "skills-class",
      "small-group-training",
      "speed-agility",
      "showcase",
      "combine",
      "open-practice",
      "special-event",
    ]),
    sport: z.enum(["Baseball", "Softball", "Both"]),
    location: z.string().trim().min(3).max(300),
    capacity: z.number().int().min(1).max(1000),
    coachIds: coaches,
    reason,
  })
  .strict();
export const operationalEventSettingsInput = z
  .object({
    eventId: id,
    revision,
    capacity: z.number().int().min(1).max(1000),
    coachIds: coaches,
    publication: z.enum(["draft", "open", "closed", "archived"]),
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(10).max(5000).optional(),
    location: z.string().trim().min(3).max(300).optional(),
    reason,
  })
  .strict();
export const operationalEventSessionCreateInput = z
  .object({
    eventId: id,
    revision,
    date,
    start: time,
    end: time,
    location: z.string().trim().min(3).max(300),
    reason,
  })
  .strict();
export const operationalEventEnrollmentInput = z
  .object({
    eventId: id,
    sessionKey: z.string().regex(/^[a-f0-9]{64}$/),
    sessionRevision: revision,
    athleteId: id,
    revision,
    action: z.enum(["enroll", "unenroll", "check-in"]),
    reason,
  })
  .strict();
export type OperationalEventCreate = z.infer<typeof operationalEventCreateInput>;
export type OperationalEventSettings = z.infer<typeof operationalEventSettingsInput>;
export type OperationalEventSessionCreate = z.infer<typeof operationalEventSessionCreateInput>;
export type OperationalEventEnrollment = z.infer<typeof operationalEventEnrollmentInput>;
export type OperationalEventWorkspace = {
  events: {
    id: string;
    revision: number;
    name: string;
    description: string;
    type: string;
    sport: string;
    location: string;
    capacity: number;
    coachIds: string[];
    publication: string;
    metadataEditable: boolean;
    sessions: {
      sessionKey: string;
      revision: number;
      date: string;
      start: string;
      end: string;
      location: string;
      status: string;
      additional: boolean;
      enrollments: {
        athleteId: string;
        name: string;
        revision: number;
        status: string;
        checkedIn: boolean;
      }[];
    }[];
  }[];
  coaches: { id: string; name: string }[];
  athletes: { id: string; name: string }[];
};
