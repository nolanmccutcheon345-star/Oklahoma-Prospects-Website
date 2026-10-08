import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid date.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const tryoutEventInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    sport: z.enum(["Baseball", "Softball"]),
    season: z.string().trim().min(1).max(120),
    ageGroups: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(30)
      .refine(
        (values) => new Set(values.map((v) => v.toLowerCase())).size === values.length,
        "Remove duplicate age groups.",
      ),
    date,
    startTime: time,
    endTime: time,
    location: z.string().trim().min(1).max(500),
    capacity: z.number().int().min(1).max(1000),
    status: z.enum(["draft", "published", "cancelled"]),
  })
  .strict()
  .refine(
    (value) => value.endTime > value.startTime,
    "End time must follow start time on the same day.",
  );
export type TryoutEventInput = z.infer<typeof tryoutEventInput>;
export type TryoutEvent = TryoutEventInput;
