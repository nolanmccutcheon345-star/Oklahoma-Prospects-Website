import { PRICES } from "../pricing";
import type { Product } from "./contracts";
export const CATALOG_VERSION = "2026-09-square-1";
/** Availability is operational; approved amounts cannot be overwritten by a browser or dollar-valued desk row. */
export function approvedProducts(rows: Product[]): Product[] {
  return rows
    .filter((p) => p.id in PRICES)
    .map((p) => ({
      ...p,
      price: PRICES[p.id as keyof typeof PRICES] / 100,
      ...(p.id === "m3" ? { remote: 1 } : {}),
    }));
}
export function approvedCents(id: string) {
  if (!(id in PRICES)) throw new Error("Product is not in the approved catalog.");
  return PRICES[id as keyof typeof PRICES];
}
export function addCalendarMonth(value: Date) {
  const next = new Date(value);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
}
