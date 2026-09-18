import { createHash } from "node:crypto";
import type { SquareClient, Square } from "square";
import type { Sql } from "../db";
import { PRICES } from "../pricing";
import type { SquareSettings } from "./square-config";

export const MONTHLY_PLANS = [
  { id: "prospect", name: "Prospect cage pass" },
  { id: "all-star", name: "All-Star cage pass" },
  { id: "elite-family", name: "Elite Family cage pass" },
  { id: "m1", name: "Development Membership" },
  { id: "m2", name: "Performance Membership" },
  { id: "m3", name: "Elite Hybrid Membership" },
  { id: "m4", name: "Small-Group Development" },
  { id: "m5", name: "Remote HS Pitching Coaching" },
] as const;
type PlanSettings = Pick<SquareSettings, "environment" | "merchantId" | "locationId">;
export function planMappingKey(c: PlanSettings, productId: string) {
  if (!MONTHLY_PLANS.some((p) => p.id === productId)) throw new Error("Unknown monthly plan.");
  return `square-plan:${c.environment}:${c.merchantId}:${c.locationId}:${productId}`;
}
export async function savedPlan(sql: Sql, c: PlanSettings, productId: string) {
  const [row] = await sql<{
    value: { variationId?: string; cents?: number };
  }>`select value from commerce_policy where id=${planMappingKey(c, productId)}`;
  if (!row || row.value.cents !== PRICES[productId as keyof typeof PRICES]) return undefined;
  return row.value.variationId;
}
export function assertMonthlyPlan(object: Square.CatalogObject | undefined, cents: number) {
  const variation =
    object?.type === "SUBSCRIPTION_PLAN_VARIATION"
      ? object.subscriptionPlanVariationData
      : undefined;
  const phase = variation?.phases?.[0];
  if (
    object?.isDeleted ||
    object?.presentAtAllLocations === false ||
    !variation ||
    variation.phases?.length !== 1 ||
    phase?.cadence !== "MONTHLY" ||
    phase.periods ||
    phase.pricing?.type !== "STATIC" ||
    phase.pricing.priceMoney?.currency !== "USD" ||
    phase.pricing.priceMoney.amount !== BigInt(cents)
  )
    throw new Error(
      "The Square plan does not match the approved monthly price. Enrollment is unavailable.",
    );
}
/** Idempotent setup only; no customer, card, subscription, or payment is created. */
export async function prepareMonthlyPlans(
  sql: Sql,
  client: SquareClient,
  c: PlanSettings,
  userId: string,
  configured: (productId: string) => string | undefined,
) {
  // Sandbox first. This action cannot activate live enrollment or alter production catalog.
  if (c.environment !== "sandbox")
    throw new Error("Prepare and verify monthly plans in Sandbox first.");
  const { location } = await client.locations.get({ locationId: c.locationId });
  if (
    location?.merchantId !== c.merchantId ||
    location.status !== "ACTIVE" ||
    location.currency !== "USD" ||
    location.timezone !== "America/Chicago" ||
    !location.capabilities?.includes("CREDIT_CARD_PROCESSING")
  )
    throw new Error(
      "Square location must match this business and be enabled for cards in USD, America/Chicago.",
    );
  const results: { id: string; name: string; cents: number; ready: boolean; error?: string }[] = [];
  for (const plan of MONTHLY_PLANS) {
    const cents = PRICES[plan.id];
    try {
      let variationId = configured(plan.id) || (await savedPlan(sql, c, plan.id));
      if (!variationId) {
        const key = createHash("sha256")
          .update(`${planMappingKey(c, plan.id)}:${cents}:v1`)
          .digest("hex")
          .slice(0, 44);
        const { idMappings } = await client.catalog.object.upsert({
          idempotencyKey: key,
          object: {
            type: "SUBSCRIPTION_PLAN",
            id: "#plan",
            presentAtAllLocations: true,
            subscriptionPlanData: {
              name: plan.name,
              subscriptionPlanVariations: [
                {
                  type: "SUBSCRIPTION_PLAN_VARIATION",
                  id: "#monthly",
                  presentAtAllLocations: true,
                  subscriptionPlanVariationData: {
                    name: "Monthly",
                    subscriptionPlanId: "#plan",
                    phases: [
                      {
                        cadence: "MONTHLY",
                        ordinal: 0n,
                        pricing: {
                          type: "STATIC",
                          priceMoney: { amount: BigInt(cents), currency: "USD" },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        });
        variationId =
          idMappings?.find((m) => m.clientObjectId === "#monthly")?.objectId || undefined;
        if (!variationId)
          throw new Error(
            "Square did not return the monthly plan ID. Retry setup to reconcile it.",
          );
      }
      const { object } = await client.catalog.object.get({ objectId: variationId });
      assertMonthlyPlan(object, cents);
      await sql`insert into commerce_policy(id,value,updated_by) values(${planMappingKey(c, plan.id)},${JSON.stringify({ variationId, cents })}::jsonb,${userId}) on conflict(id) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now()`;
      results.push({ ...plan, cents, ready: true });
    } catch (e) {
      // Never expose provider response bodies, credentials or request headers.
      results.push({
        ...plan,
        cents,
        ready: false,
        error:
          e instanceof Error &&
          (e.message.startsWith("The Square plan") || e.message.startsWith("Square did not"))
            ? e.message
            : "Square could not prepare this plan. Retry setup; completed plans are preserved.",
      });
    }
  }
  return results;
}
