/** Dry-run by default. Credentials come from the environment, never command arguments. */
import { SquareClient, SquareEnvironment, type Square } from "square";
import { createHash } from "node:crypto";
import { PRICES } from "../src/lib/pricing";
import { CATALOG_VERSION } from "../src/lib/commerce/catalog";
const names: Record<keyof typeof PRICES, string> = {
  individual: "Household cage hourly rate",
  team: "Team cage hourly rate",
  field: "Fielding area hourly rate",
  prospect: "Prospect cage pass",
  "all-star": "All-Star cage pass",
  "elite-family": "Elite Family cage pass",
  m1: "Development Membership",
  m2: "Performance Membership",
  m3: "Elite Hybrid Membership",
  m4: "Small-Group Development",
  m5: "Remote HS Pitching Coaching",
  p1: "Four 30-minute sessions",
  p2: "Four 60-minute sessions",
  p3: "Eight 60-minute sessions",
  s1: "New Pitcher Assessment",
  s2: "Private Development 30 minutes",
  s3: "Private Development 60 minutes",
  s4: "Pitching Lab / Reassessment",
  s5: "Remote Video Review",
  s6: "Small-Group monthly alias",
  s7: "Private Hitting 30 minutes",
  s8: "Private Hitting 60 minutes",
  s9: "Hitting Assessment",
  s10: "Private Catching 30 minutes",
  s11: "Private Catching 60 minutes",
  s12: "Private Fielding 60 minutes",
};
const recurring = new Set(["prospect", "all-star", "elite-family", "m1", "m2", "m3", "m4", "m5"]);
const environment = process.env.SQUARE_ENVIRONMENT;
if (!["sandbox", "production"].includes(environment || ""))
  throw new Error("Set SQUARE_ENVIRONMENT to sandbox or production.");
const apply = process.argv.includes("--apply");
if (!apply) {
  console.log(
    JSON.stringify(
      {
        environment,
        catalogVersion: CATALOG_VERSION,
        products: Object.entries(PRICES)
          .filter(([id]) => id !== "s6")
          .map(([id, cents]) => ({
            id,
            name: names[id as keyof typeof names],
            cents,
            currency: "USD",
            cadence: recurring.has(id) ? "MONTHLY" : null,
          })),
        fee: { name: "First-month fee (no assessment on file)", cents: 5000 },
        message: "Dry run. Add --apply to create the reviewed catalog in this environment.",
      },
      null,
      2,
    ),
  );
} else {
  const prefix = `SQUARE_${environment!.toUpperCase()}_`,
    token = process.env[prefix + "ACCESS_TOKEN"],
    locationId = process.env[prefix + "LOCATION_ID"];
  if (!token || !locationId)
    throw new Error("Configure this environment’s access token and location.");
  const client = new SquareClient({
    token,
    environment:
      environment === "sandbox" ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
  });
  const { location } = await client.locations.get({ locationId });
  if (
    location?.status !== "ACTIVE" ||
    location.currency !== "USD" ||
    location.timezone !== "America/Chicago" ||
    !location.capabilities?.includes("CREDIT_CARD_PROCESSING")
  )
    throw new Error("Location must be ACTIVE, USD, America/Chicago, and enabled for cards.");
  const mapping: Record<string, string> = {};
  for (const [id, cents] of [
    ...Object.entries(PRICES).filter(([id]) => id !== "s6"),
    ["setup-fee", 5000],
  ] as [string, number][]) {
    const name =
      id === "setup-fee"
        ? "First-month fee (no assessment on file)"
        : names[id as keyof typeof names];
    const plan = recurring.has(id),
      objectId = `#prospects-${id}`,
      variationId = `#prospects-${id}-variation`;
    const object: Square.CatalogObject = plan
      ? {
          type: "SUBSCRIPTION_PLAN",
          id: objectId,
          subscriptionPlanData: {
            name,
            subscriptionPlanVariations: [
              {
                type: "SUBSCRIPTION_PLAN_VARIATION",
                id: variationId,
                subscriptionPlanVariationData: {
                  name: "Monthly",
                  subscriptionPlanId: objectId,
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
        }
      : {
          type: "ITEM",
          id: objectId,
          itemData: {
            name,
            variations: [
              {
                type: "ITEM_VARIATION",
                id: variationId,
                itemVariationData: {
                  itemId: objectId,
                  name: "Standard",
                  pricingType: "FIXED_PRICING",
                  priceMoney: { amount: BigInt(cents), currency: "USD" },
                },
              },
            ],
          },
        };
    const result = await client.catalog.object.upsert({
      idempotencyKey: createHash("sha256")
        .update(`${CATALOG_VERSION}:${environment}:${id}`)
        .digest("hex")
        .slice(0, 44),
      object,
    });
    const mapped = result.idMappings?.find((m) => m.clientObjectId === variationId)?.objectId;
    if (!mapped)
      throw new Error("Catalog mapping was not returned; reconcile this product before retrying.");
    mapping[plan ? prefix + "PLAN_" + id.toUpperCase().replaceAll("-", "_") : id] = mapped;
  }
  console.log(
    JSON.stringify(
      {
        environment,
        catalogVersion: CATALOG_VERSION,
        locationId,
        merchantId: location.merchantId,
        mapping,
      },
      null,
      2,
    ),
  );
}
