import { z } from "zod";
import type { TrainingEvent } from "./training-events-contracts";

export const THANKSGIVING_CAMP = {
  title: "Prospects Thanksgiving Camp",
  dates: ["2026-11-23", "2026-11-24", "2026-11-25"],
  dayPriceCents: 4500,
  packagePriceCents: 12000,
  capacity: 150,
  location: "Prospects Sports Academy, 3804 S. Elm Pl., Suite A, Broken Arrow, OK 74011",
  coaches: ["Steve McCutcheon", "Nolan McCutcheon", "Billy Ramey"],
  groups: [
    {
      id: "f11c71ad-4f47-46eb-995c-2efca7cb61dc",
      label: "6–9U",
      value: "6-9U",
      minAge: 6,
      maxAge: 9,
      start: "09:00",
      end: "11:30",
      time: "9:00–11:30 a.m.",
    },
    {
      id: "d972e2f0-7841-4431-a28d-4bf1e8dc4af4",
      label: "10U–14U",
      value: "10U-14U",
      minAge: 10,
      maxAge: 14,
      start: "13:00",
      end: "15:30",
      time: "1:00–3:30 p.m.",
    },
  ],
} as const;
export const thanksgivingGroup = (id: string) => THANKSGIVING_CAMP.groups.find((g) => g.id === id);
export const thanksgivingDetailsSchema = z
  .object({
    parentName: z.string().trim().min(1, "Enter the parent or guardian name.").max(120),
    parentPhone: z
      .string()
      .trim()
      .min(7)
      .max(30)
      .refine(
        (s) => s.replace(/\D/g, "").length >= 10,
        "Enter a phone number with at least 10 digits.",
      ),
    sport: z.enum(["Baseball", "Softball"]),
    ageGroup: z.enum(["6-9U", "10U-14U"]),
  })
  .strict();
export type ThanksgivingDetails = z.infer<typeof thanksgivingDetailsSchema>;
export function thanksgivingEventMatches(event: TrainingEvent) {
  const group = thanksgivingGroup(event.id);
  return (
    !!group &&
    event.type === "camp" &&
    event.sport === "Both" &&
    event.minAge === group.minAge &&
    event.maxAge === group.maxAge &&
    event.priceCents === THANKSGIVING_CAMP.packagePriceCents &&
    event.dayPriceCents === THANKSGIVING_CAMP.dayPriceCents &&
    event.pricingMode === "both" &&
    event.location === THANKSGIVING_CAMP.location &&
    event.sessions.length === 3 &&
    THANKSGIVING_CAMP.dates.every((date) =>
      event.sessions.some((s) => s.date === date && s.start === group.start && s.end === group.end),
    )
  );
}
