/**
 * Print-on-demand store boundary. Shopify and a fulfillment provider will be
 * configured later; no customer payment or order is accepted by this module.
 */
export type PodProvider = "printful" | "printify";
export type MerchCategory = "hats" | "shirts" | "hoodies" | "beanies" | "tote-bags" | "cage-jackets";
export type MerchStatus = "draft" | "review" | "published" | "retired";
export type MerchProduct = {
  id: string;
  title: string;
  category: MerchCategory;
  status: MerchStatus;
  imageUrls: string[];
  variants: Array<{
    sku: string;
    color: string;
    size: string;
    retailCents: number;
    estimatedProductionCents: number;
    estimatedShippingCents: number;
    providerVariantId?: string;
  }>;
};
export type PodOrderState =
  | "awaiting-payment"
  | "paid"
  | "submitted-to-provider"
  | "in-production"
  | "shipped"
  | "delivered"
  | "exception"
  | "cancelled"
  | "refunded";

export function validateMerchProduct(product: MerchProduct): string[] {
  const errors: string[] = [];
  if (!product.id.trim() || !product.title.trim()) errors.push("Product ID and title required");
  if (!product.variants.length) errors.push("At least one variant required");
  const seen = new Set<string>();
  for (const variant of product.variants) {
    if (!variant.sku.trim() || seen.has(variant.sku)) errors.push("Unique SKU required");
    seen.add(variant.sku);
    if (!variant.color.trim() || !variant.size.trim()) errors.push("Color and size required");
    if (![variant.retailCents, variant.estimatedProductionCents, variant.estimatedShippingCents].every(v => Number.isSafeInteger(v) && v >= 0)) errors.push("Invalid price/cost");
    if (product.status === "published" && !variant.providerVariantId) errors.push("Published variant needs fulfillment mapping");
  }
  if (product.status === "published" && !product.imageUrls.length) errors.push("Published product needs images");
  return errors;
}
export function estimatedGrossMarginCents(retailCents: number, productionCents: number, shippingCents: number): number {
  if (![retailCents, productionCents, shippingCents].every(v => Number.isSafeInteger(v) && v >= 0)) throw new Error("Invalid amount");
  return retailCents - productionCents - shippingCents;
}
/** Actual checkout shipping, taxes and provider costs must be quoted live. */
export const MERCH_CHECKOUT_ENABLED = false as const;
