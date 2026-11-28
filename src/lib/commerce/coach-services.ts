import type { Quote } from "./contracts";

/** Memberships book an assessment or one of their included lesson services. */
export function checkoutLessonService(
  quote: Pick<Quote, "kind" | "productId" | "setupCents" | "discipline" | "sessionMinutes"> & {
    assessment?: boolean;
  },
) {
  if (quote.kind === "membership") {
    if (quote.assessment || quote.setupCents > 0)
      return quote.discipline === "Hitting" ? "s9" : "s1";
    return quote.sessionMinutes === 30 ? "s2" : "s3";
  }
  return quote.productId;
}

/** Display the two Nolan records as one choice while honoring an explicit booking link. */
export function distinctLessonInstructors<T extends { id: string; name: string }>(
  coaches: T[],
  preferredId?: string,
  availableIds: ReadonlySet<string> = new Set(),
): T[] {
  const isNolan = (coach: T) => /^\s*(?:coach\s+)?nolan\s+mccutcheon\s*$/i.test(coach.name);
  const records = coaches.filter(isNolan);
  if (records.length < 2) return coaches;
  const preferred =
    records.find((coach) => coach.id === preferredId) ??
    records.find((coach) => availableIds.has(coach.id)) ??
    records[0];
  return coaches.filter((coach) => !isNolan(coach) || coach.id === preferred.id);
}
