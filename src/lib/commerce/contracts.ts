import { z } from "zod";
import { eligibility } from "../pricing";
import { BOOKABLE_LANES } from "../club";
import type { AppliedDiscount } from "./discounts";

export const checkoutInput = z
  .object({
    requestId: z.string().uuid(),
    productId: z.string().trim().min(1).max(80),
    kind: z.enum(["lesson", "package", "membership", "cage", "cage-plan"]),
    athleteId: z.string().max(100).optional(),
    coachId: z.string().max(100).optional(),
    date: z.string().max(10).optional(),
    time: z.string().max(5).optional(),
    duration: z.number().int().min(30).max(180).multipleOf(30).optional(),
    laneIds: z.array(z.string().max(30)).max(6).default([]),
    athleteCount: z.number().int().min(1).max(100).default(1),
    household: z.boolean().default(false),
    discountCode: z.string().trim().max(32).optional(),
    discountVersion: z.number().int().positive().optional(),
    consent: z.boolean().default(false),
    email: z.string().email().max(254),
    name: z.string().trim().min(1).max(120),
    playerName: z.string().trim().max(120).optional(),
    playerBirthDate: z.string().max(10).optional(),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutInput>;
export type Product = {
  id: string;
  kind: string;
  name: string;
  price: number;
  minutes: number;
  credits: number;
  remote: number;
  expires_days: number;
  hours: number;
  discipline: string;
  active: boolean;
};
export type Quote = {
  productId: string;
  kind: string;
  title: string;
  totalCents: number;
  regularCents: number;
  setupCents: number;
  recurring: boolean;
  assessment: boolean;
  duration: number;
  sessionMinutes: number;
  credits: number;
  remote: number;
  filmReviews?: number;
  expiresDays: number;
  discipline: string;
  resources: string[];
  lines: { label: string; cents: number }[];
  teamRate: boolean;
  needsSlot: boolean;
  subtotalCents?: number;
  discount?: AppliedDiscount;
};

/** Product data and completed-assessment status must come from server storage. */
export function calculateQuote(
  input: CheckoutInput,
  product: Product,
  completed: boolean,
  cages: Product[] = [],
  requireConsent = true,
): Quote {
  if (!product.active || product.id !== input.productId)
    throw new Error("That product is unavailable.");
  if (
    product.kind.replace("_", "-") !== input.kind &&
    !(product.id === "s6" && input.kind === "lesson")
  )
    throw new Error("Product type does not match.");
  const rule = eligibility(input.kind, product.id, completed);
  if (rule.locked)
    throw new Error(
      "Complete your assessment with your coach to unlock ordinary lessons and packages.",
    );
  const recurring =
    input.kind === "membership" || input.kind === "cage-plan" || product.id === "s6";
  if (requireConsent && recurring && !input.consent)
    throw new Error("Please agree to monthly renewal before starting your membership.");
  const quote: Quote = {
    productId: product.id === "s6" ? "m4" : product.id,
    kind: product.id === "s6" ? "membership" : input.kind,
    title: product.name,
    totalCents: Math.round(product.price * 100) + rule.setupCents,
    regularCents: Math.round(product.price * 100),
    setupCents: rule.setupCents,
    recurring,
    assessment: rule.assessment || rule.setupCents > 0,
    duration: product.minutes,
    sessionMinutes: product.minutes,
    credits: product.credits,
    remote: product.remote,
    filmReviews: product.id === "m3" ? 1 : 0,
    expiresDays: product.expires_days,
    discipline: product.discipline,
    resources: [],
    lines: [{ label: product.name, cents: Math.round(product.price * 100) }],
    teamRate: false,
    needsSlot:
      input.kind === "cage" ||
      (input.kind === "lesson" && product.id !== "s5") ||
      input.kind === "membership",
  };
  if (rule.setupCents) {
    quote.duration = product.discipline === "Hitting" ? 60 : 75;
    quote.lines.push({ label: "First-month fee (no assessment on file)", cents: rule.setupCents });
  }
  if (input.kind === "membership" && product.id === "m5" && completed) quote.needsSlot = false;
  if (input.kind === "cage-plan" && (!input.household || input.athleteCount > 2))
    throw new Error("Cage passes are for one or two household athletes, never team practices.");
  if (input.kind === "cage") {
    const ids = [...new Set(input.laneIds)];
    if (!ids.length || ids.some((id) => !BOOKABLE_LANES.some((l) => l.id === id)))
      throw new Error("Select valid lanes.");
    if (!input.duration) throw new Error("Choose a duration.");
    quote.duration = input.duration;
    quote.teamRate = ids.length >= 3 || input.athleteCount >= 3 || !input.household;
    quote.lines = ids.map((id) => {
      const lane = BOOKABLE_LANES.find((l) => l.id === id)!;
      const rateId = lane.group === "field" ? "field" : quote.teamRate ? "team" : "individual";
      const rate = cages.find((p) => p.id === rateId && p.active);
      if (!rate) throw new Error("The rate for this lane is unavailable.");
      return {
        label: `${lane.name} · ${input.duration} min`,
        cents: Math.round((rate.price * 100 * input.duration!) / 60),
      };
    });
    quote.resources = ids.map((id) => `lane:${id}`);
    quote.totalCents = quote.lines.reduce((sum, line) => sum + line.cents, 0);
    quote.regularCents = quote.totalCents;
  }
  if (!Number.isSafeInteger(quote.totalCents) || quote.totalCents <= 0)
    throw new Error("Invalid product price.");
  return quote;
}
