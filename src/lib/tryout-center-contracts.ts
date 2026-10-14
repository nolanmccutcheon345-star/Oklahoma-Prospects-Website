import { z } from "zod";
import { validDate } from "./scheduling";
export const TRYOUT_STATUSES = [
  "new",
  "contacted",
  "scheduled",
  "confirmed",
  "attended",
  "no-show",
  "follow-up-needed",
  "offered",
  "accepted",
  "closed",
] as const;
const id = z.string().min(1).max(200);
export const centerWorkInput = z
  .object({
    id,
    revision: z.number().int().min(0),
    assignee: z.string().max(200),
    teamId: z.string().max(200),
    status: z.enum(TRYOUT_STATUSES),
    followUpDate: z.string().refine((v) => !v || validDate(v)),
    note: z.string().trim().max(3000),
    actionId: z.string().uuid(),
  })
  .strict();
export const centerMessageInput = z
  .object({
    id,
    actionId: z.string().uuid(),
    kind: z.enum(["email", "call", "note", "family-reply"]),
    subject: z.string().trim().max(200),
    body: z.string().trim().min(1).max(5000),
  })
  .strict();
export const centerPreferencesInput = z
  .object({
    emailEnabled: z.boolean(),
    sports: z.array(z.enum(["baseball", "softball"])).max(2),
    ages: z.array(z.string().trim().min(1).max(40)).max(30),
    teamIds: z.array(z.string().max(200)).max(100),
  })
  .strict();
export const centerAppointmentInput = z
  .object({
    id: z.string().uuid(),
    requestId: id,
    revision: z.number().int().min(0),
    coachId: id,
    eventId: z.string().max(200),
    date: z.string().refine(validDate),
    time: z.string(),
    duration: z
      .number()
      .int()
      .min(20)
      .max(180)
      .refine((v) => v % 5 === 0),
    location: z.string().trim().min(3).max(500),
    laneIds: z.array(z.enum(["1", "2", "3-4", "5", "6", "7"])).max(6),
    status: z.enum(["proposed", "confirmed", "cancelled"]),
    actionId: z.string().uuid(),
  })
  .strict();
export type CenterWorkInput = z.infer<typeof centerWorkInput>;
export type CenterMessageInput = z.infer<typeof centerMessageInput>;
export type CenterAppointmentInput = z.infer<typeof centerAppointmentInput>;
