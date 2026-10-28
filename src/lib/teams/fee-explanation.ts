import { z } from "zod";

export const feeExplanationSchema = z
  .object({
    initialDeposit: z.string().trim().max(4000),
    monthlyDues: z.string().trim().max(4000),
    teamExpenses: z.string().trim().max(4000),
    additionalNotes: z.string().trim().max(4000),
  })
  .strict();
export type FeeExplanation = z.infer<typeof feeExplanationSchema>;
export const emptyFeeExplanation = (): FeeExplanation => ({
  initialDeposit: "",
  monthlyDues: "",
  teamExpenses: "",
  additionalNotes: "",
});
export const feeExplanationFields = [
  ["initialDeposit", "What the initial deposit covers"],
  ["monthlyDues", "What monthly Prospects dues cover"],
  ["teamExpenses", "Costs the team must fund separately"],
  ["additionalNotes", "Additional notes (optional)"],
] as const;
export function feeExplanationIssues(value?: FeeExplanation) {
  return feeExplanationFields
    .slice(0, 3)
    .filter(([key]) => !value?.[key]?.trim())
    .map(([, label]) => `Complete “${label}” before publishing. State explicitly if none apply.`);
}
export function requireFeeExplanation(value?: FeeExplanation) {
  const issues = feeExplanationIssues(value);
  if (issues.length) throw Error(issues.join(" "));
}
/** Plain text is shared by previews and immutable agreement snapshots. Never HTML. */
export function feeExplanationText(value?: FeeExplanation) {
  if (!value) return "";
  return feeExplanationFields
    .filter(([key]) => value[key].trim())
    .map(([key, label]) => `${label}\n${value[key].trim()}`)
    .join("\n\n");
}
