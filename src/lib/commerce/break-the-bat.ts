import type { Quote } from "./contracts";

export const BREAK_THE_BAT_CODE = "BREAKTHEBAT10";

/** This advertised campaign has fixed terms even if its admin definition is edited. */
export function assertBreakTheBatTerms(quote: Quote, code: string, kind: string, value: number) {
  if (code !== BREAK_THE_BAT_CODE) return;
  if (kind !== "percentage" || value !== 1000)
    throw new Error("This offer is temporarily unavailable. Please contact the facility.");
  const cageLanes = quote.resources.filter((id) => id.startsWith("lane:"));
  const cage = quote.kind === "cage" && cageLanes.length === 1 && cageLanes[0] !== "lane:3-4";
  const lesson = quote.kind === "lesson" && !quote.assessment && quote.needsSlot;
  if ((!cage && !lesson) || quote.recurring || quote.setupCents > 0)
    throw new Error(
      "BREAKTHEBAT10 applies to one cage rental or one private lesson. Assessments, fielding rentals, packages and memberships are excluded.",
    );
}
