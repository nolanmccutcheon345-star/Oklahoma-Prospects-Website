import { z } from "zod";
import { chicagoDate, validDate } from "../scheduling";
import type { Quote } from "./contracts";

export const discountPurchaseTypes = ["cage", "assessment", "lesson", "package"] as const;
export type DiscountPurchaseType = (typeof discountPurchaseTypes)[number];
export const discountPurchaseLabels: Record<DiscountPurchaseType, string> = {
  cage: "Cage and fielding rentals",
  assessment: "Assessments",
  lesson: "Private lessons",
  package: "Lesson packages",
};

export const discountCode = z
  .string()
  .trim()
  .toUpperCase()
  .min(3)
  .max(32)
  .regex(/^[A-Z0-9_-]+$/, "Use 3–32 letters, numbers, hyphens or underscores.");
const date = z.string().refine(validDate, "Choose a valid date.").nullable();
export const discountInput = z
  .object({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    code: discountCode,
    kind: z.enum(["percentage", "fixed"]),
    // Percentage in hundredths of one percent, or fixed amount in cents.
    value: z.number().int().min(1).max(1_000_000),
    startsOn: date,
    endsOn: date,
    active: z.boolean(),
    purchaseTypes: z
      .array(z.enum(discountPurchaseTypes))
      .min(1, "Select at least one purchase type.")
      .max(4)
      .refine(
        (types) => new Set(types).size === types.length,
        "Select each purchase type only once.",
      ),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.kind === "percentage" && input.value >= 10_000)
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Percentage must be below 100%; bookings require payment.",
      });
    if (input.startsOn && input.endsOn && input.endsOn < input.startsOn)
      ctx.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "End date must be on or after start date.",
      });
    if (Boolean(input.id) !== Boolean(input.version))
      ctx.addIssue({ code: "custom", message: "Reload the discount before editing it." });
  });
export type DiscountInput = z.infer<typeof discountInput>;
export type Discount = {
  id: string;
  code: string;
  kind: "percentage" | "fixed";
  value: number;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  version: number;
  purchase_types: DiscountPurchaseType[];
};
export type AppliedDiscount = {
  id: string;
  code: string;
  kind: Discount["kind"];
  value: number;
  version: number;
  cents: number;
};
export function discountStatus(discount: Discount, now = new Date()) {
  const today = chicagoDate(now);
  if (!discount.active) return "Inactive";
  if (discount.starts_on && today < discount.starts_on) return "Scheduled";
  if (discount.ends_on && today > discount.ends_on) return "Expired";
  return "Active";
}
export function applyDiscount(quote: Quote, discount: Discount, now = new Date()): Quote {
  if (discountStatus(discount, now) !== "Active")
    throw new Error("This discount code is inactive, expired, or not yet available.");
  if (quote.recurring || quote.setupCents > 0)
    throw new Error(
      "Discount codes apply to one-time purchases, not monthly memberships or renewal fees.",
    );
  const purchaseType = quote.kind === "lesson" && quote.assessment ? "assessment" : quote.kind;
  if (!discount.purchase_types.includes(purchaseType as DiscountPurchaseType))
    throw new Error("This discount code does not apply to this purchase type.");
  if (quote.discount) throw new Error("Only one discount code can be used per checkout.");
  const cents =
    discount.kind === "percentage"
      ? Math.round((quote.totalCents * discount.value) / 10_000)
      : discount.value;
  if (!Number.isSafeInteger(cents) || cents < 1 || quote.totalCents - cents < 1)
    throw new Error(
      "This code must leave at least $0.01 to pay. Use it on a larger order or remove it.",
    );
  return {
    ...quote,
    subtotalCents: quote.totalCents,
    discount: {
      id: discount.id,
      code: discount.code,
      kind: discount.kind,
      value: discount.value,
      version: discount.version,
      cents,
    },
    totalCents: quote.totalCents - cents,
    regularCents: quote.regularCents - cents,
    lines: [...quote.lines, { label: `Discount · ${discount.code}`, cents: -cents }],
  };
}
