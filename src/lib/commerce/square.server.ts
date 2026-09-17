import { SquareClient, SquareEnvironment } from "square";
import { createHash } from "node:crypto";
import { resolveSquareConfig } from "./square-config";
export function squareConfig() {
  const value = resolveSquareConfig({
    ...process.env,
    CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT || process.env.CONTEXT,
  });
  if (!value)
    throw new Error("Online payments are not active. Payment is required to confirm a booking.");
  return value;
}
export function squarePublicConfig() {
  const c = resolveSquareConfig({
    ...process.env,
    CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT || process.env.CONTEXT,
  });
  return c
    ? { environment: c.environment, applicationId: c.applicationId, locationId: c.locationId }
    : null;
}
export function paymentMode(): "disabled" | "test" | "live" {
  const c = resolveSquareConfig({
    ...process.env,
    CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT || process.env.CONTEXT,
  });
  return !c ? "disabled" : c.environment === "sandbox" ? "test" : "live";
}
export function squareClient() {
  const c = squareConfig();
  return new SquareClient({
    token: c.token,
    environment:
      c.environment === "sandbox" ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
    timeoutInSeconds: 15,
    maxRetries: 2,
  });
}
/** Stable provider keys fit Square's 45-character limit. Never derived from card data. */
export function squareKey(operation: string, id: string) {
  return createHash("sha256").update(`${operation}:${id}`).digest("hex").slice(0, 44);
}
export function planVariation(productId: string) {
  const c = squareConfig();
  const id =
    process.env[
      `SQUARE_${c.environment.toUpperCase()}_PLAN_${productId.toUpperCase().replaceAll("-", "_")}`
    ];
  if (!id)
    throw new Error("This monthly plan is not ready for enrollment. No payment has been taken.");
  return id;
}
export function safePaymentError(error: unknown) {
  const codes =
    (error as { body?: { errors?: { code?: string }[] } })?.body?.errors?.map((e) => e.code) || [];
  if (codes.includes("CVV_FAILURE")) return "Check the card security code and try again.";
  if (codes.includes("ADDRESS_VERIFICATION_FAILURE"))
    return "Check the card billing postal code and try again.";
  if (codes.includes("CARD_EXPIRED") || codes.includes("EXPIRATION_FAILURE"))
    return "Check the card expiration date or use another card.";
  if (
    codes.includes("CARD_DECLINED") ||
    codes.includes("GENERIC_DECLINE") ||
    codes.includes("INSUFFICIENT_FUNDS")
  )
    return "The card was declined. Contact your bank or use another card.";
  return "Payment could not be confirmed. Check payment status before trying another checkout.";
}
