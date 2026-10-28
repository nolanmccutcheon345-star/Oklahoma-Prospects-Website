import { checkoutScopeAllowsKind, type SquareCheckoutScope } from "./commerce/square-config";

/** Public, non-secret launch state. Unverified product families fail closed. */
export type PurchaseAvailability = {
  ready: boolean;
  scope: SquareCheckoutScope | "disabled";
  unavailableProductIds?: string[];
};
export function canPurchase(availability: PurchaseAvailability | undefined, kind: string, id: string) {
  if (!availability?.ready || availability.scope === "disabled") return false;
  if (id === "m4" || id === "s6") return false; // no published group calendar yet
  if (availability.unavailableProductIds?.includes(id)) return false;
  return checkoutScopeAllowsKind(availability.scope, kind);
}
