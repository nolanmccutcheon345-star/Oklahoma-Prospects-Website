import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
export const getThanksgivingCamp = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("./db");
  const { getThanksgivingEvents } = await import("./thanksgiving-camp.server");
  const { squarePublicConfig } = await import("./commerce/square.server");
  const square = squarePublicConfig();
  return {
    events: await getThanksgivingEvents(await getSql()),
    paymentsAvailable:
      !!square &&
      square.checkoutScope === "all" &&
      !!process.env.RESEND_API_KEY &&
      !!(process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM),
  };
});
export const createThanksgivingDrafts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { createThanksgivingDraftsFor } = await import("./thanksgiving-camp.server");
    const { squareConfig } = await import("./commerce/square.server");
    const { prepareThanksgivingSandboxFixtures } =
      await import("./thanksgiving-sandbox-fixtures.server");
    const config = squareConfig();
    const sql = await getSql();
    await prepareThanksgivingSandboxFixtures(sql, context.userId, {
      environment: config.environment,
      origin: config.origin,
      context: process.env.SQUARE_DEPLOY_CONTEXT || process.env.CONTEXT,
      runtimeContext: process.env.CONTEXT,
    });
    return createThanksgivingDraftsFor(sql, context.userId);
  });
