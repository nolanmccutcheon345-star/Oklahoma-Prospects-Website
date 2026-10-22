import { z } from "zod";
export const registrationFilters = z
  .object({
    season: z.string().max(120).default(""),
    birthYear: z.string().max(4).default(""),
    graduationYear: z.string().max(7).default(""),
    school: z.string().max(160).default(""),
    suggestedDivision: z.string().max(20).default(""),
    age: z.string().max(20).default(""),
    eligibilityStatus: z.string().max(50).default(""),
    sport: z.string().max(20).default(""),
    page: z.number().int().min(0).max(100000).default(0),
    sort: z.enum(["newest", "player"]).default("newest"),
  })
  .strict();
export type RegistrationFilters = z.infer<typeof registrationFilters>;
export const emptyRegistrationFilters: RegistrationFilters = registrationFilters.parse({});
// Values travel as one JSON parameter; only fixed server-owned field names enter SQL.
export function registrationFilterSql(parameter: string, alias = "r") {
  return [
    "season",
    "birthYear",
    "graduationYear",
    "school",
    "suggestedDivision",
    "age",
    "eligibilityStatus",
    "sport",
  ]
    .map(
      (k) =>
        `(coalesce(${parameter}::jsonb->>'${k}','')='' or lower(coalesce(${alias}.payload->>'${k}',${k === "eligibilityStatus" ? "'Needs review'" : "''"}))=lower(${parameter}::jsonb->>'${k}'))`,
    )
    .join(" and ");
}
