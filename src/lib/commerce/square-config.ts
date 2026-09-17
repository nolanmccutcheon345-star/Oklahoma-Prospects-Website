/** Public identifiers are the only configuration returned to the browser. */
export type SquareEnvironment = "sandbox" | "production";
export type SquareSettings = {
  environment: SquareEnvironment;
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
  if (environment !== "sandbox" && environment !== "production") return null;
  if (env.CONTEXT === "production" && environment !== "production") return null;
  if (
    environment === "production" &&
    (env.CONTEXT !== "production" ||
      env.SQUARE_LIVE_ENABLED !== "true" ||
      env.SQUARE_SANDBOX_VERIFIED !== "true")
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
