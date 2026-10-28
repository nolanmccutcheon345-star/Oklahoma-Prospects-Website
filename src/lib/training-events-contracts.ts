import { z } from "zod";
export const eventTypes = {
  camp: "Camp",
  clinic: "Clinic",
  "skills-class": "Skills class",
  "small-group-training": "Small-group training",
  "speed-agility": "Speed & agility session",
  showcase: "Showcase",
  combine: "Player combine",
  "open-practice": "Open practice",
  "special-event": "Special event",
} as const;
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
    minAge: z.number().int().min(0).max(100).optional(),
    maxAge: z.number().int().min(0).max(100).optional(),
    sport: z.enum(["Baseball", "Softball", "Both"]),
    description: z.string().trim().min(10).max(5000),
    priceCents: z.number().int().min(0).max(1000000),
    pricingMode: z.enum(["package", "days", "both"]).optional(),
    dayPriceCents: z.number().int().min(0).max(1000000).optional(),
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
    if (e.minAge !== undefined && e.maxAge !== undefined && e.minAge > e.maxAge)
      c.addIssue({ code: "custom", message: "Youngest age cannot exceed oldest age." });
    const mode = e.pricingMode || "package";
    if (mode !== "days" && e.priceCents < 1)
      c.addIssue({ code: "custom", message: "Set the full-camp price." });
    if (mode !== "package" && !e.dayPriceCents)
      c.addIssue({ code: "custom", message: "Set the price per day." });
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
    option: z.enum(["package", "days"]).optional(),
    dates: z.array(date).max(30).optional(),
  })
  .strict();
export type EventCheckout = z.infer<typeof eventCheckoutSchema>;

export function campPurchase(
  event: TrainingEvent,
  choice: { option?: "package" | "days"; dates?: string[] } = {},
) {
  const mode = event.pricingMode || "package",
    option = choice.option || "package";
  if ((mode === "package" && option !== "package") || (mode === "days" && option !== "days"))
    throw Error("Choose an available camp pricing option.");
  const allDates = [...new Set(event.sessions.map((s) => s.date))].sort();
  const dates = option === "package" ? allDates : [...(choice.dates || [])].sort();
  if (
    !dates.length ||
    new Set(dates).size !== dates.length ||
    dates.some((d) => !allDates.includes(d))
  )
    throw Error("Select valid camp days, once each.");
  if (
    option === "package" &&
    choice.dates?.length &&
    JSON.stringify([...choice.dates].sort()) !== JSON.stringify(allDates)
  )
    throw Error("Full-camp registration includes every day.");
  const sessions = event.sessions.filter((s) => dates.includes(s.date));
  const totalCents =
    option === "package" ? event.priceCents : (event.dayPriceCents || 0) * dates.length;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0)
    throw Error("Camp pricing is unavailable.");
  return { option, dates, sessions, totalCents };
}
export function campPriceLabel(
  e: Pick<TrainingEvent, "pricingMode" | "priceCents" | "dayPriceCents">,
) {
  const money = (c: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
  return e.pricingMode === "days"
    ? money(e.dayPriceCents || 0) + " per day"
    : e.pricingMode === "both"
      ? money(e.priceCents) + " full camp or " + money(e.dayPriceCents || 0) + " per day"
      : money(e.priceCents) + " full camp";
}

// Eligibility uses the first camp date for all purchases, including selected days.
export function campAgeLabel(e: Pick<TrainingEvent, "minAge" | "maxAge">) {
  if (e.minAge === undefined && e.maxAge === undefined) return "All ages";
  if (e.minAge === undefined) return `Ages ${e.maxAge} and younger`;
  if (e.maxAge === undefined) return `Ages ${e.minAge} and older`;
  return e.minAge === e.maxAge ? `Age ${e.minAge}` : `Ages ${e.minAge}–${e.maxAge}`;
}
export function campAgeError(
  e: Pick<TrainingEvent, "minAge" | "maxAge" | "sessions">,
  birthDate?: string | null,
) {
  if (e.minAge === undefined && e.maxAge === undefined) return "";
  const asOf = e.sessions.map((s) => s.date).sort()[0];
  const birth = birthDate?.slice(0, 10);
  if (!birth || !date.safeParse(birth).success || birth > asOf)
    return "Add a valid player birthday in your family account before registering for this event.";
  let age = Number(asOf.slice(0, 4)) - Number(birth.slice(0, 4));
  if (asOf.slice(5) < birth.slice(5)) age--;
  if ((e.minAge !== undefined && age < e.minAge) || (e.maxAge !== undefined && age > e.maxAge))
    return `This event is for ${campAgeLabel(e).toLowerCase()} on ${asOf}, the first camp day. This player is not eligible.`;
  return "";
}
