type Env = Record<string, string | undefined>;

/** Owner-only diagnostics. Never return configuration values or credentials. */
export function feeEmailReadiness(env: Env) {
  const blockers: string[] = [];
  if (env.SQUARE_DEPLOY_CONTEXT !== "production") blockers.push("This is not a production build.");
  if (env.CONTEXT && env.CONTEXT !== "production")
    blockers.push("The runtime is not a production deployment.");
  if (env.TRYOUT_NOTIFICATIONS_ENABLED !== "true")
    blockers.push("Scheduled email delivery has not been enabled.");
  if (!env.TRYOUT_NOTIFICATIONS_SECRET)
    blockers.push("The email worker authentication key has not been configured.");
  if (!env.RESEND_API_KEY) blockers.push("The email provider connection is not configured.");
  if (!(env.RESEND_FROM_EMAIL || env.EMAIL_FROM))
    blockers.push("The email sender address is not configured.");
  if (env.INVITATION_EMAIL_PAUSED === "true")
    blockers.push("Invitation and fee-email delivery is explicitly paused.");
  return { enabled: blockers.length === 0, blockers };
}

export function collectionLaunchReadiness(env: Env) {
  const blockers: string[] = [];
  if (env.SQUARE_DEPLOY_CONTEXT !== "production")
    blockers.push("Live collection requires a production build.");
  if (env.TEAM_AUTOPAY_ENABLED !== "true")
    blockers.push("Automatic team collections have not been enabled.");
  if (env.TEAM_AUTOPAY_SANDBOX_VERIFIED !== "true")
    blockers.push("Square Sandbox acceptance testing has not been recorded.");
  return {
    blockers,
    sandboxSettingsLocal: [
      "APPLICATION_ID",
      "LOCATION_ID",
      "MERCHANT_ID",
      "ACCESS_TOKEN",
      "WEBHOOK_SIGNATURE_KEY",
      "WEBHOOK_URL",
    ].every((key) => Boolean(env["SQUARE_SANDBOX_" + key])),
  };
}
