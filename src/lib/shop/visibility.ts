import type { ShopProduct } from "./contracts";

type VisibilityInput = Pick<
  ShopProduct,
  "archived" | "published" | "sample_approved" | "coming_soon"
>;

export type ShopPublicVisibility = { visible: boolean; label: string; reason: string };

/**
 * Mirrors the public shop query in store.server.ts (`published and (sample_approved or
 * coming_soon) and not archived`) so the office can say why a saved product is or is not
 * on /merchandise. Display only: it never grants publication or checkout.
 */
export function shopPublicVisibility(p: VisibilityInput): ShopPublicVisibility {
  if (p.archived)
    return { visible: false, label: "Hidden", reason: "Archived products are never shown." };
  if (!p.published)
    return {
      visible: false,
      label: "Hidden",
      reason: "Draft. Choose Coming soon (needs an approved photo) or For sale, then save.",
    };
  if (p.coming_soon)
    return {
      visible: true,
      label: "Visible",
      reason: "Shown as coming soon. Orders are disabled.",
    };
  if (p.sample_approved)
    return { visible: true, label: "Visible", reason: "Shown for sale when checkout is ready." };
  return {
    visible: false,
    label: "Hidden",
    reason: "Marked published, but the physical sample is not approved.",
  };
}

export const NEW_DRAFT_MESSAGE =
  "Draft created. It stays hidden from the public shop until it has an approved photo and you set it to Coming soon or For sale.";
