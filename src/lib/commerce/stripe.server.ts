import Stripe from "stripe";

export function paymentMode(): "disabled" | "test" | "live" {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.APP_BASE_URL) return "disabled";
  if (key.startsWith("sk_test_")) return "test";
  if (key.startsWith("sk_live_") && process.env.CONTEXT === "production" && process.env.STRIPE_LIVE_ENABLED === "true") return "live";
  return "disabled";
}
export function stripeClient() {
  if (paymentMode() === "disabled") throw new Error("Reserve now, pay at the desk. Card checkout is not active yet.");
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2 });
}
export function checkoutOrigin() {
  const raw = process.env.CONTEXT && process.env.CONTEXT !== "production"
    ? process.env.DEPLOY_PRIME_URL || process.env.APP_BASE_URL : process.env.APP_BASE_URL;
  if (!raw) throw new Error("Checkout origin is not configured.");
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("Invalid checkout origin.");
  return url.origin;
}
