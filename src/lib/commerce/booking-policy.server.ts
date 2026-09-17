import { getSql, type Sql } from "../db";
import { chicagoDate } from "../scheduling";
export async function requirePriorityPolicy(sql: Sql) {
  const [policy] = await sql<{
    value: { standardDays?: number };
  }>`select value from commerce_policy where id='cage-booking-window'`;
  if (
    !policy ||
    !Number.isInteger(policy.value.standardDays) ||
    policy.value.standardDays! < 1 ||
    policy.value.standardDays! >= 14
  )
    throw new Error(
      "The office must configure the standard booking window before All-Star priority enrollment opens.",
    );
  return policy.value.standardDays!;
}
export function withinBookingHorizon(date: string, days: number, now = new Date()) {
  const diff =
    (Date.parse(date + "T12:00:00Z") - Date.parse(chicagoDate(now) + "T12:00:00Z")) / 86400000;
  return Number.isInteger(diff) && diff >= 0 && diff <= days;
}
export async function checkCageBookingWindow(householdIds: string[], date: string) {
  const sql = await getSql();
  const [policy] = await sql<{
    value: { standardDays: number };
  }>`select value from commerce_policy where id='cage-booking-window'`;
  if (!policy) return; // Priority pass enrollment is disabled until this policy is set.
  const [priority] =
    await sql`select g.id from credit_grants g join commerce_orders o on o.id=g.order_id where g.household_id=any(${householdIds}::text[]) and o.product_id='all-star' and o.status='paid' and g.starts_at<=now() and g.expires_at>now() limit 1`;
  const days = priority ? 14 : policy.value.standardDays;
  if (!withinBookingHorizon(date, days))
    throw new Error(`Your cage booking window is ${days} days ahead.`);
}
