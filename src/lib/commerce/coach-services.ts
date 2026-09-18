import type { Quote } from "./contracts";

/** Memberships book an assessment or one of their included lesson services. */
export function checkoutLessonService(
  quote: Pick<Quote, "kind" | "productId" | "setupCents" | "discipline" | "sessionMinutes">,
) {
  if (quote.kind === "membership") {
    if (quote.setupCents > 0) return quote.discipline === "Hitting" ? "s9" : "s1";
    return quote.sessionMinutes === 30 ? "s2" : "s3";
  }
  return quote.productId;
}
