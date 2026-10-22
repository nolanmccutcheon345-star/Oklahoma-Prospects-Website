import { z } from "zod";
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const shopNavigationSchema = z
  .array(
    z
      .object({
        id: identifier,
        label: z.string().trim().min(1).max(60),
        options: z
          .array(z.object({ id: identifier, label: z.string().trim().min(1).max(60) }).strict())
          .max(40),
      })
      .strict(),
  )
  .max(8)
  .superRefine((groups, ctx) => {
    const ids = groups.flatMap((g) => [g.id, ...g.options.map((o) => o.id)]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Each group and collection needs a unique ID." });
    for (const g of groups) {
      const labels = g.options.map((o) => o.label.toLocaleLowerCase());
      if (new Set(labels).size !== labels.length)
        ctx.addIssue({
          code: "custom",
          message: "Collection names must be unique within each group.",
        });
    }
  });
export const collectionIdsSchema = z
  .array(identifier)
  .max(320)
  .refine((ids) => new Set(ids).size === ids.length, "Choose each collection once.");
export type ShopNavigation = z.infer<typeof shopNavigationSchema>;
export type CollectionProduct = { category: string; collection_ids?: string[] };
export function inShopCollection(
  product: CollectionProduct,
  option: ShopNavigation[number]["options"][number],
) {
  return Boolean(product.collection_ids?.includes(option.id));
}
export function matchesShopFilters(
  product: CollectionProduct,
  groups: ShopNavigation,
  filters: Record<string, string>,
) {
  return groups.every((g) => {
    const id = filters[g.id];
    if (!id) return true;
    const option = g.options.find((o) => o.id === id);
    return Boolean(option && inShopCollection(product, option));
  });
}
