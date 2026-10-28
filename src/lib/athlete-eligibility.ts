import { validDate } from "./scheduling";
export type EligibilityRule = {
  id: string;
  organization: string;
  sport: string;
  seasons: string[];
  cutoff: string;
  divisions: number[];
  source: string;
  verifiedOn: string;
  effectiveFrom?: string;
  effectiveThrough?: string;
  exceptions?: string;
};
// Explicit season mappings only. Never extrapolate a rule into an unverified year.
export const eligibilityRules: EligibilityRule[] = [
  {
    id: "usssa-fastpitch-2027-age-v1",
    organization: "USSSA",
    sport: "softball",
    seasons: ["Fall 2026", "Spring 2027", "Summer 2027"],
    cutoff: "2026-08-31",
    divisions: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18],
    source: "https://orfastpitch.usssa.com/2027-season-age-chart/",
    verifiedOn: "2026-10-22",
    effectiveFrom: "2026-08-11",
    exceptions:
      "Base age only. Event-specific divisions and play-up approval require staff review.",
  },
  {
    id: "usssa-baseball-2027-age-v1",
    organization: "USSSA",
    sport: "baseball",
    seasons: ["Fall 2026", "Spring 2027", "Summer 2027"],
    cutoff: "2027-04-30",
    divisions: Array.from({ length: 15 }, (_, i) => i + 4),
    source: "https://www.usssabaseball.org/images/USSSA_National_By-Laws_11-21-2025.pdf",
    verifiedOn: "2026-10-22",
    effectiveFrom: "2026-08-12",
    exceptions:
      "Rule 3.01: grade exceptions require actual grade, age limits, documentation and team exception limits; staff approval required. Graduation year is not evidence of grade.",
  },
];
export function calculateEligibility(
  birthDate: string,
  sport: string,
  season: string,
  requested: string,
  rules: EligibilityRule[] = eligibilityRules,
  organization = "USSSA",
) {
  const rule = rules.find(
    (r) =>
      r.organization === organization &&
      r.sport === sport.toLowerCase() &&
      r.seasons.includes(season),
  );
  const base = {
    suggestedDivision: "",
    eligibilityStatus: "Needs review",
    eligibilityRule: rule?.id || "",
    eligibilitySource: rule?.source || "",
    eligibilityCutoff: rule?.cutoff || "",
    eligibilityExplanation:
      "Eligibility not calculated: no verified ruleset for this sport and season.",
  };
  if (!validDate(birthDate))
    return {
      ...base,
      eligibilityExplanation: "Eligibility not calculated: birthdate is missing or invalid.",
    };
  if (!rule) return base;
  if (!validDate(rule.cutoff) || birthDate > rule.cutoff)
    return { ...base, eligibilityExplanation: "Birthdate or rule cutoff needs review." };
  const age =
    +rule.cutoff.slice(0, 4) -
    +birthDate.slice(0, 4) -
    (rule.cutoff.slice(5) < birthDate.slice(5) ? 1 : 0);
  const division = [...rule.divisions].sort((a, b) => a - b).find((n) => n >= age);
  if (!division)
    return { ...base, eligibilityExplanation: "Age falls outside this verified youth ruleset." };
  const suggestedDivision = `${division}U`;
  return {
    ...base,
    suggestedDivision,
    eligibilityStatus:
      requested.toUpperCase() === suggestedDivision ? "Age calculation complete" : "Needs review",
    eligibilityExplanation: `${rule.organization}: age ${age} on ${rule.cutoff}; base division ${suggestedDivision}. ${requested.toUpperCase() === suggestedDivision ? "Staff must confirm placement and any additional eligibility requirements." : "Requested division differs; staff must review play-up or exception requirements."} ${rule.exceptions || ""}`,
  };
}
