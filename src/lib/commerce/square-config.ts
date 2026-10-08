/** Public identifiers are the only configuration returned to the browser. */
export const SQUARE_CHECKOUT_SCOPES = ["all", "cages", "cages-lessons"] as const;
export type SquareCheckoutScope = (typeof SQUARE_CHECKOUT_SCOPES)[number];
export type SquareEnvironment = "sandbox" | "production";
export type SquareSettings = {
  environment: SquareEnvironment;
  checkoutScope: SquareCheckoutScope;
  applicationId: string;
  locationId: string;
  merchantId: string;
  token: string;
  signatureKey: string;
  webhookUrl: string;
  origin: string;
};

export function isSquareCheckoutScope(value: string): value is SquareCheckoutScope {
  return (SQUARE_CHECKOUT_SCOPES as readonly string[]).includes(value);
}

/**
 * Production acceptance is per scope. Cage verification does not open lessons,
 * and the full-catalog flag does not open the cages-lessons allowlist.
 */
function productionSandboxAccepted(
  scope: SquareCheckoutScope,
  env: Record<string, string | undefined>,
) {
  if (scope === "cages") return env.SQUARE_CAGE_SANDBOX_VERIFIED === "true";
  if (scope === "cages-lessons") return env.SQUARE_CAGES_LESSONS_SANDBOX_VERIFIED === "true";
  return env.SQUARE_SANDBOX_VERIFIED === "true";
}

/** One-time kinds this scope may sell. Recurring quotes are rejected separately. */
export function checkoutScopeAllowsKind(scope: string, kind: string) {
  const normalized = kind.replaceAll("_", "-");
  if (scope === "all") return true;
  if (scope === "cages") return normalized === "cage";
  if (scope === "cages-lessons") return normalized === "cage" || normalized === "lesson";
  return false;
}

export const CAGES_CHECKOUT_NOTICE =
  "Online checkout is open for one-time cage bookings. Memberships, lessons and packages are not yet available for purchase.";
export const CAGES_LESSONS_CHECKOUT_NOTICE =
  "Online checkout is open for one-time cage bookings, lessons, and assessments. Memberships, packages, and passes are not yet available for purchase.";

/** Customer copy when this product is outside the active checkout allowlist. */
export function checkoutScopeCustomerNotice(
  scope: SquareCheckoutScope | null | undefined,
  kind: string,
) {
  if (!scope || scope === "all" || checkoutScopeAllowsKind(scope, kind)) return null;
  return scope === "cages-lessons" ? CAGES_LESSONS_CHECKOUT_NOTICE : CAGES_CHECKOUT_NOTICE;
}

export function resolveSquareConfig(
  env: Record<string, string | undefined>,
): SquareSettings | null {
  const environment = env.SQUARE_ENVIRONMENT;
  const checkoutScope = env.SQUARE_CHECKOUT_SCOPE || "all";
  if (!isSquareCheckoutScope(checkoutScope)) return null;
  const accepted = productionSandboxAccepted(checkoutScope, env);
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
  const allowed =
    checkoutScopeAllowsKind(config.checkoutScope, quote.kind) &&
    (config.checkoutScope === "all" || !quote.recurring);
  if (allowed) return;
  if (config.checkoutScope === "cages-lessons")
    throw new Error(
      "Online checkout is currently open for one-time cage bookings, lessons, and assessments. Memberships, packages, and passes are not yet available for purchase.",
    );
  throw new Error(
    "Online checkout is currently open for one-time cage bookings only. Memberships, lessons and packages are not yet available for purchase.",
  );
}
