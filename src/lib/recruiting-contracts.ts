import { z } from "zod";
export const CONSENT_VERSION = "recruiting-2026-10-10";
export const CONSENT_TEXT =
  "I am this player’s parent or legal guardian. I authorize publication of their recruiting profile, photo, biography, school, graduation year, optional academic and physical details, submitted and verified measurements, videos, team assignments, and individual game statistics. The profile is visible to anyone on the internet. The player may edit their profile and request metric verification. I can withdraw consent here at any time to hide the profile. Birthdays, household contacts, private coaching notes, and financial records are not published.";
export const metricDefinitions = {
  pitchVelocity: { label: "Pitch velocity", unit: "mph", max: 120 },
  exitVelocity: { label: "Exit velocity", unit: "mph", max: 130 },
  infieldVelocity: { label: "Infield throwing velocity", unit: "mph", max: 120 },
  outfieldVelocity: { label: "Outfield throwing velocity", unit: "mph", max: 120 },
  catcherVelocity: { label: "Catcher throwing velocity", unit: "mph", max: 110 },
  sixtyYard: { label: "60-yard dash", unit: "seconds", max: 30 },
  homeToFirst: { label: "Home to first", unit: "seconds", max: 20 },
  popTime: { label: "Catcher pop time", unit: "seconds", max: 10 },
  broadJump: { label: "Standing broad jump", unit: "inches", max: 180 },
} as const;
export type MetricKey = keyof typeof metricDefinitions;
const text = (n: number) => z.string().trim().max(n);
const url = z.union([
  z.literal(""),
  z
    .string()
    .url()
    .max(2000)
    .refine((s) => s.startsWith("https://"), "Use an HTTPS link."),
]);
export const profileData = z
  .object({
    bio: text(3000),
    photo: z
      .string()
      .max(1400000)
      .refine(
        (s) =>
          !s ||
          s.startsWith("https://") ||
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s),
        "Use an HTTPS image or upload a JPG, PNG or WebP.",
      ),
    school: text(150),
    gradYear: z.string().regex(/^$|^20\d{2}$/),
    city: text(120),
    positions: text(100),
    bats: z.enum(["", "R", "L", "S"]),
    throws: z.enum(["", "R", "L"]),
    height: text(30),
    weight: text(30),
    gpa: text(20),
    commitment: text(150),
    video: url,
  })
  .strict();
export const blankProfile: z.infer<typeof profileData> = {
  bio: "",
  photo: "",
  school: "",
  gradYear: "",
  city: "",
  positions: "",
  bats: "",
  throws: "",
  height: "",
  weight: "",
  gpa: "",
  commitment: "",
  video: "",
};
export const playerKey = z.object({ athleteId: z.string().min(1).max(150) }).strict();
export const saveProfileInput = playerKey
  .extend({ revision: z.number().int().min(0), profile: profileData })
  .strict();
export const consentInput = playerKey
  .extend({ publish: z.boolean(), signer: text(150), consent: z.boolean() })
  .strict();
export const metricInput = playerKey
  .extend({
    id: z.union([z.literal(""), z.string().uuid()]),
    revision: z.number().int().min(0),
    metric: z.enum([
      "pitchVelocity",
      "exitVelocity",
      "infieldVelocity",
      "outfieldVelocity",
      "catcherVelocity",
      "sixtyYard",
      "homeToFirst",
      "popTime",
      "broadJump",
    ]),
    value: z.number().positive(),
    measuredOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (s) => Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
        "Choose a real measurement date.",
      ),
    evidence: url,
    request: z.boolean(),
  })
  .strict()
  .refine((s) => s.value <= metricDefinitions[s.metric].max, "Check the measurement and units.");
export const reviewInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    approve: z.boolean(),
    method: text(500),
    note: text(1000),
  })
  .strict();
export const linkInput = playerKey
  .extend({
    teamId: z.string().min(1).max(150),
    rosterId: z.string().min(1).max(150),
    remove: z.boolean().optional(),
  })
  .strict();
export function currentSeason(date = new Date()) {
  const month = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "numeric" }).format(
      date,
    ),
  );
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
  }).format(date);
  return `${month >= 9 && month <= 11 ? "Fall" : month >= 6 && month <= 8 ? "Summer" : month >= 3 && month <= 5 ? "Spring" : "Winter"} ${year}`;
}
