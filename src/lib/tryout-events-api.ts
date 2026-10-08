import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./auth/middleware";
import { tryoutEventInput } from "./tryout-events-contracts";
export const getPublicTryoutEvents = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("./db");
  const { publicTryoutEventsFor } = await import("./tryout-events.server");
  return publicTryoutEventsFor(await getSql());
});
export const getAdminTryoutEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { adminTryoutEventsFor } = await import("./tryout-events.server");
    return adminTryoutEventsFor(await getSql(), context.userId);
  });
export const saveTryoutEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(tryoutEventInput)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { saveTryoutEventFor } = await import("./tryout-events.server");
    return saveTryoutEventFor(await getSql(), context.userId, data);
  });

export const getAdminTryoutEnrollments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("./db");
    const { adminTryoutEnrollmentsFor } = await import("./tryout-enrollment.server");
    return adminTryoutEnrollmentsFor(await getSql(), context.userId);
  });
