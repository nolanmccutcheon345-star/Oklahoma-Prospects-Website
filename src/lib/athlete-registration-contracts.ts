import { z } from "zod";
import { validDate, chicagoDate } from "./scheduling";
export const athleteRegistrationInput = z
  .object({
    athleteId: z.string().max(200).default(""),
    revision: z.number().int().min(0).default(0),
    birthDate: z
      .string()
      .refine((v) => validDate(v) && v <= chicagoDate(), "Enter a valid date of birth."),
    graduationYear: z
      .union([z.literal("unknown"), z.string().regex(/^\d{4}$/)])
      .refine(
        (v) => v === "unknown" || (+v >= 1950 && +v <= new Date().getFullYear() + 25),
        "Choose an expected graduation year.",
      ),
    schoolStatus: z.enum(["school", "homeschool", "other", "not-enrolled"]),
    school: z.string().trim().max(160),
    eligibilityOrganization: z.enum(["USSSA", "unknown"]).default("USSSA"),
    currentGrade: z
      .enum([
        "unknown",
        "pre-k",
        "k",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
      ])
      .default("unknown"),
    correctionReason: z.string().trim().max(500).default(""),
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.schoolStatus === "school" || v.schoolStatus === "other") && !v.school)
      c.addIssue({ code: "custom", path: ["school"], message: "Enter the school name." });
  });
export type AthleteRegistrationInput = z.infer<typeof athleteRegistrationInput>;
export const registrationSummaryFields = [
  "athleteId",
  "birthMonthYear",
  "birthYear",
  "graduationYear",
  "school",
  "schoolStatus",
  "suggestedDivision",
  "eligibilityStatus",
  "eligibilityExplanation",
  "eligibilityRule",
  "eligibilitySource",
  "eligibilityCutoff",
  "currentGrade",
  "profileConfirmedAt",
] as const;
export type RegistrationSummary = Partial<
  Record<(typeof registrationSummaryFields)[number], string>
>;
export function registrationSummary(payload: Record<string, unknown>): RegistrationSummary {
  return Object.fromEntries(
    registrationSummaryFields.flatMap((k) =>
      typeof payload[k] === "string" ? [[k, payload[k]]] : [],
    ),
  );
}

export const eligibilityReviewInput=z.object({
 requestId:z.string().min(1).max(200),revision:z.number().int().min(0),
 decision:z.enum(['approved','deferred']),reason:z.string().trim().min(5).max(500),
 ruleReference:z.string().trim().min(3).max(500),
}).strict();
