import { z } from "zod";
export const cartSchema = z
  .array(
    z
      .object({
        productId: z.string().max(80),
        variantId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
      })
      .strict(),
  )
  .min(1)
  .max(20)
  .refine(
    (rows) => new Set(rows.map((r) => `${r.productId}:${r.variantId}`)).size === rows.length,
    "Combine duplicate cart lines.",
  );
export const addressSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    address1: z.string().trim().min(4).max(150),
    address2: z.string().trim().max(100).default(""),
    city: z.string().trim().min(2).max(80),
    state_code: z.string().regex(/^[A-Z]{2}$/),
    country_code: z.literal("US"),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  })
  .strict();
export const shopCheckoutSchema = z
  .object({
    requestId: z.string().uuid(),
    cart: cartSchema,
    address: addressSchema,
    consent: z.literal(true),
  })
  .strict();
export type Cart = z.infer<typeof cartSchema>;
export type ShopCheckout = z.infer<typeof shopCheckoutSchema>;
export type PrintItem = {
  variant_id: number;
  quantity: number;
  files: { id: number; type: string }[];
  options: { id: string; value: unknown }[];
  retail_price?: string;
  name?: string;
};
export type ShopVariant = {
  id: number;
  label: string;
  priceCents: number;
  available: boolean;
  item: Omit<PrintItem, "quantity">;
};
export type ShopProduct = {
  id: string;
  title: string;
  description: string;
  category: string;
  image_url: string;
  size_guide: string;
  team_label: string;
  tax_code: string;
  variants: ShopVariant[];
  published: boolean;
  sample_approved: boolean;
  revision: number;
};
export function dollarsToCents(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("A provider amount is unavailable.");
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error("A provider amount is invalid.");
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents > 100000000)
    throw new Error("A provider amount is invalid.");
  return cents;
}
export function safeHttps(value: unknown) {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
}
export function selectedLines(products: ShopProduct[], cart: Cart) {
  return cartSchema.parse(cart).map((line) => {
    const p = products.find((p) => p.id === line.productId && p.published && p.sample_approved);
    const v = p?.variants.find((v) => v.id === line.variantId && v.available);
    if (!p || !v || !Number.isSafeInteger(v.priceCents) || v.priceCents <= 0)
      throw new Error("An item or size is no longer available. Refresh your bag.");
    return { product: p, variant: v, quantity: line.quantity };
  });
}
