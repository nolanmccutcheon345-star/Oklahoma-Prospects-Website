import { createServerFn } from "@tanstack/react-start";
import { paymentAuth } from "../commerce/payment-auth";
import { teamCheckoutSchema } from "./payment-contracts";
export const startTeamCheckout = createServerFn({ method: "POST" })
  .middleware([paymentAuth])
  .validator(teamCheckoutSchema)
  .handler(async ({ data, context }) => {
    const { assertPaymentRequest } = await import("../commerce/square-payments.server");
    assertPaymentRequest();
    const { rateLimit } = await import("../commerce/checkout.server");
    await rateLimit("team-checkout", 20);
    const { squareConfig, squarePublicConfig } = await import("../commerce/square.server");
    const c = squareConfig();
    const { assertSquareCheckoutScope } = await import("../commerce/square-config");
    assertSquareCheckoutScope(c, { kind: "team-fee", recurring: false });
    const { getSql } = await import("../db");
    const { prepareTeamCheckout } = await import("./payment.server");
    return {
      ...(await prepareTeamCheckout(await getSql(), context.paymentUserId, data, c.environment)),
      square: squarePublicConfig(),
    };
  });
