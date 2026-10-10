import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid date.",
  );
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5][05]$/, "Use a five-minute time increment.");
export const trainingEventSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(0),
    name: z.string().trim().min(3).max(120),
    type: z.enum(["camp", "clinic"]),
    sport: z.enum(["Baseball", "Softball", "Both"]),
    description: z.string().trim().min(10).max(5000),
    priceCents: z.number().int().min(1).max(1000000),
    location: z.string().trim().min(3).max(300),
    sessions: z
      .array(z.object({ date, start: time, end: time }).strict())
      .min(1)
      .max(30),
    coachIds: z.array(z.string().min(1).max(100)).min(1).max(20),
    capacity: z.number().int().min(1).max(1000),
    status: z.enum(["draft", "published", "closed", "cancelled"]),
    policy: z.string().trim().min(5).max(3000),
  })
  .strict()
  .superRefine((e, c) => {
    const sorted = [...e.sessions].sort((a, b) =>
      (a.date + a.start).localeCompare(b.date + b.start),
    );
    sorted.forEach((s, i) => {
      if (s.end <= s.start)
        c.addIssue({ code: "custom", message: "Each session must end after it starts." });
      if (i && s.date === sorted[i - 1].date && s.start < sorted[i - 1].end)
        c.addIssue({ code: "custom", message: "Event sessions cannot overlap." });
    });
    if (new Set(e.coachIds).size !== e.coachIds.length)
      c.addIssue({ code: "custom", message: "Choose each coach once." });
  });
export type TrainingEvent = z.infer<typeof trainingEventSchema>;
export const eventCheckoutSchema = z
  .object({
    eventId: z.string().uuid(),
    athleteId: z.string().min(1).max(100),
    revision: z.number().int().positive(),
    requestId: z.string().uuid(),
    consent: z.literal(true),
  })
  .strict();
export type EventCheckout = z.infer<typeof eventCheckoutSchema>;
