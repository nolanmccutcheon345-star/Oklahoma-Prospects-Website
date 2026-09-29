/** Public, non-secret launch state. Unverified product families fail closed. */
export type PurchaseAvailability = { ready: boolean; scope: "all" | "cages" | "disabled" };
export function canPurchase(availability: PurchaseAvailability | undefined, kind: string, id: string) {
  if (!availability?.ready || availability.scope === "disabled") return false;
  if (id === "m4" || id === "s6") return false; // no published group calendar yet
  return availability.scope === "all" || kind === "cage";
}
