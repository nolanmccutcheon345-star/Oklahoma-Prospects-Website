/** Widths the public shop actually requests. The image API accepts only these. */
export const SHOP_IMAGE_WIDTHS = [200, 600, 900] as const;
export type ShopImageWidth = (typeof SHOP_IMAGE_WIDTHS)[number];

/** Return an allowed shop image width, or undefined when no resize should run. */
export function allowedShopImageWidth(width?: number): ShopImageWidth | undefined {
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) return undefined;
  const requested = Math.round(width);
  const exact = SHOP_IMAGE_WIDTHS.find((allowed) => allowed === requested);
  if (exact) return exact;
  return SHOP_IMAGE_WIDTHS.reduce((best, allowed) =>
    Math.abs(allowed - requested) < Math.abs(best - requested) ? allowed : best,
  );
}
