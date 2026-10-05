const EMAIL_UNAVAILABLE = "Account email is temporarily unavailable. Please try again shortly.";
const DEPLOY_CONTEXTS = new Set(["production", "deploy-preview", "branch-deploy", "development", "dev"]);

/** Reject multiple recipients and display-name syntax before reaching the provider. */
function singleAddress(value: string) {
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+$/.test(value);
}

/**
 * SQUARE_DEPLOY_CONTEXT is pinned into the server bundle by Vite for all
 * deployments. Runtime context may further restrict it, never promote a
 * preview build to production. Unknown/missing context fails closed.
 */
export function authEmailAllowed(to: string, env: Record<string, string | undefined>) {
  const address = to.trim();
  if (!singleAddress(address)) return false;
  const contexts = [env.SQUARE_DEPLOY_CONTEXT, env.CONTEXT].filter(
    (context): context is string => context !== undefined,
  );
  if (!contexts.length || contexts.some((context) => !DEPLOY_CONTEXTS.has(context))) return false;
  if (contexts.every((context) => context === "production")) return true;

  // Exact addresses only: no wildcard/domain/subdomain matching or implicit opt-in.
  const recipients = (env.AUTH_EMAIL_TEST_RECIPIENTS || "").split(",").map((value) => value.trim());
  return recipients.some(
    (recipient) => singleAddress(recipient) && recipient.toLowerCase() === address.toLowerCase(),
  );
}

/** Credentials stay on the server; verification tokens are never logged. */
export async function deliverAuthEmail(to: string, subject: string, url: string) {
  if (!authEmailAllowed(to, {
    ...process.env,
    // Keep the direct expression so Vite replaces it with the build context.
    SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT,
  })) throw new Error(EMAIL_UNAVAILABLE);
  const key = process.env.RESEND_API_KEY,
    from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;
  if (!key || !from) throw new Error(EMAIL_UNAVAILABLE);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to.trim()],
      subject,
      text: `Oklahoma Prospects\n\n${subject}:\n${url}\n\nIf you did not request this, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Email could not be delivered. Please try again.");
}
