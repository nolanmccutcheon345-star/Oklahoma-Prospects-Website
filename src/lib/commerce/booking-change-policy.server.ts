import type { Sql } from "../db";
import { refundCents } from "../pricing";

type AllowanceUse = { requestKey: string; kind: "cancellation" | "reschedule"; initiator: "parent"; at: string };
export function householdChangeMonth(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid cancellation time.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
}
function allowanceKey(householdId: string, now: Date) {
  if (!householdId) throw new Error("A verified billing household is required.");
  return `household-booking-change:${householdId}:${householdChangeMonth(now)}`;
}
async function previousUse(sql: Sql, householdId: string, now: Date) {
  const [saved] = await sql<{ value: AllowanceUse }>`select value from commerce_policy where id=${allowanceKey(householdId, now)}`;
  if (saved) return saved.value;
  // Preserve known cancellations earlier in this month when this feature is first deployed.
  // Expired checkouts, provider failures and office refunds are not family changes.
  const [historic] = await sql<{ booking_id: string; created_at: Date }>`
    select r.booking_id,r.created_at from commerce_refunds r
    join booking_records b on b.id=r.booking_id
    where b.household_id=${householdId}
      and r.reason in ('Family booking cancellation','Credit booking cancellation')
      and to_char(r.created_at at time zone 'America/Chicago','YYYY-MM')=${householdChangeMonth(now)}
    order by r.created_at,r.id limit 1`;
  return historic ? { requestKey: `booking:${historic.booking_id}`, kind: "cancellation" as const,
    initiator: "parent" as const, at: new Date(historic.created_at).toISOString() } : undefined;
}
export async function householdChangeAvailable(sql: Sql, householdId: string, requestKey: string, now = new Date()) {
  const use = await previousUse(sql, householdId, now);
  return !use || use.requestKey === requestKey;
}
/** Caller must use the same transaction as the accepted booking change.
 * The unique monthly row serializes different athletes/orders/users in one household.
 * Coach cancellations and facility closures must not call this parent-only helper. */
export async function consumeHouseholdChange(
  sql: Sql, householdId: string, userId: string, requestKey: string,
  kind: AllowanceUse["kind"], now = new Date(),
) {
  const value = await previousUse(sql, householdId, now) || {
    requestKey, kind, initiator: "parent" as const, at: now.toISOString(),
  };
  await sql`insert into commerce_policy(id,value,updated_by)
    values(${allowanceKey(householdId, now)},${JSON.stringify(value)}::jsonb,${userId}) on conflict(id) do nothing`;
  const [row] = await sql<{ value: AllowanceUse }>`select value from commerce_policy where id=${allowanceKey(householdId, now)} for update`;
  return row.value.requestKey === requestKey;
}
export function parentCancellationRefund(paidCents: number, startsAt: Date, allowanceAvailable: boolean, now = new Date()) {
  // Validate the paid amount/start even when the allowance is exhausted.
  const amount = refundCents(paidCents, startsAt, now);
  return allowanceAvailable ? amount : 0;
}
