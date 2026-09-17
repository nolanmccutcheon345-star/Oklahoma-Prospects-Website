/** Public identifiers are the only configuration returned to the browser. */
export type SquareEnvironment = "sandbox" | "production";
export type SquareSettings = {
  environment: SquareEnvironment;
  checkoutScope: "all" | "cages";
  applicationId: string;
  locationId: string;
  merchantId: string;
  token: string;
  signatureKey: string;
  webhookUrl: string;
  origin: string;
};
export function resolveSquareConfig(
  env: Record<string, string | undefined>,
): SquareSettings | null {
  const environment = env.SQUARE_ENVIRONMENT;
  const checkoutScope = env.SQUARE_CHECKOUT_SCOPE || "all";
  if (checkoutScope !== "all" && checkoutScope !== "cages") return null;
  const accepted =
    checkoutScope === "cages"
      ? env.SQUARE_CAGE_SANDBOX_VERIFIED === "true"
      : env.SQUARE_SANDBOX_VERIFIED === "true";
  if (environment !== "sandbox" && environment !== "production") return null;
  if (env.CONTEXT === "production" && environment !== "production") return null;
  if (
    environment === "production" &&
    (env.CONTEXT !== "production" || env.SQUARE_LIVE_ENABLED !== "true" || !accepted)
  )
    return null;
  const prefix = environment === "sandbox" ? "SQUARE_SANDBOX_" : "SQUARE_PRODUCTION_";
  const applicationId = env[`${prefix}APPLICATION_ID`],
    locationId = env[`${prefix}LOCATION_ID`],
    merchantId = env[`${prefix}MERCHANT_ID`];
  const token = env[`${prefix}ACCESS_TOKEN`],
    signatureKey = env[`${prefix}WEBHOOK_SIGNATURE_KEY`],
    webhookUrl = env[`${prefix}WEBHOOK_URL`];
  const origin =
    env.CONTEXT && env.CONTEXT !== "production"
      ? env.DEPLOY_PRIME_URL || env.APP_BASE_URL
      : env.APP_BASE_URL;
  if (
    !applicationId ||
    !locationId ||
    !merchantId ||
    !token ||
    !signatureKey ||
    !webhookUrl ||
    !origin
  )
    return null;
  if (applicationId.startsWith("sandbox-") !== (environment === "sandbox")) return null;
  try {
    const base = new URL(origin),
      hook = new URL(webhookUrl);
    if (
      base.protocol !== "https:" ||
      hook.origin !== base.origin ||
      hook.pathname !== "/api/square/webhook" ||
      hook.search ||
      hook.hash
    )
      return null;
    return {
      environment,
      checkoutScope,
      applicationId,
      locationId,
      merchantId,
      token,
      signatureKey,
      webhookUrl: hook.href,
      origin: base.origin,
    };
  } catch {
    return null;
  }
}

/** Scope is enforced on server-approved quotes, including existing unpaid orders. */
export function assertSquareCheckoutScope(
  config: Pick<SquareSettings, "checkoutScope">,
  quote: { kind: string; recurring: boolean },
) {
  if (config.checkoutScope === "cages" && (quote.kind !== "cage" || quote.recurring))
    throw new Error(
      "Online checkout is currently open for one-time cage bookings only. Memberships, lessons and packages are not yet available for purchase.",
    );
}
