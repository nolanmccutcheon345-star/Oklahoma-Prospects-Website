import type { Product } from "./contracts";
export const CATALOG_VERSION = "2026-09-29-exact-assessment-premium";
/** Only server-loaded, active catalog amounts are authoritative. */
export function approvedProducts(rows: Product[]): Product[] {
  return rows.filter(p => (p.active || p.id === "assessment-setup") && Number.isFinite(Number(p.price)) && Number(p.price) >= 0)
    .map(p => ({ ...p, price: Number(p.price) }));
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
