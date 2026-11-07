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
    return createThanksgivingDraftsFor(await getSql(), context.userId);
  });
