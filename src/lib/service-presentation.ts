import { z } from "zod";

export const cardIcons = ["baseball", "cage", "team", "field", "star", "shield"] as const;
export const servicePresentationInput = z
  .object({
    status: z.enum(["draft", "published", "archived"]),
    icon: z.enum(cardIcons),
    badge: z.string().trim().max(32),
    showEffectiveRate: z.boolean(),
    showSavings: z.boolean(),
    comparisonResourceId: z.string().trim().max(120),
    calculationBasis: z.enum(["included", "assumed"]),
    assumedMonthlyMinutes: z.number().int().min(0).max(600000),
    benefits: z
      .array(
        z.object({ text: z.string().trim().min(1).max(250), icon: z.enum(cardIcons) }).strict(),
      )
      .max(12),
  })
  .strict();
export type ServicePresentation = z.infer<typeof servicePresentationInput>;
export const defaultServicePresentation: ServicePresentation = {
  status: "published",
  icon: "baseball",
  badge: "",
  showEffectiveRate: true,
  showSavings: true,
  comparisonResourceId: "individual",
  calculationBasis: "included",
  assumedMonthlyMinutes: 0,
  benefits: [],
};
export function readServicePresentation(value: unknown): ServicePresentation {
  if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)
    return { ...defaultServicePresentation, benefits: [] };
  if (value === undefined || value === null) return { ...defaultServicePresentation, benefits: [] };
  const parsed = servicePresentationInput.safeParse(value);
  // Corrupt presentation must not publish a product by accident.
  return parsed.success
    ? parsed.data
    : { ...defaultServicePresentation, status: "draft", benefits: [] };
}
export function currentCageBenefit(text: string) {
  return text.replace(
    /14-day priority booking/gi,
    "Book up to 14 days ahead (available to all households)",
  );
}
