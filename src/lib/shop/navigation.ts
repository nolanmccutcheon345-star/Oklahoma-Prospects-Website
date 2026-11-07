export type ShopView = "shop" | "bag" | "orders";

export function shopSearch(search: Record<string, unknown>): { view?: Exclude<ShopView, "shop"> } {
  return { view: search.view === "bag" || search.view === "orders" ? search.view : undefined };
}
