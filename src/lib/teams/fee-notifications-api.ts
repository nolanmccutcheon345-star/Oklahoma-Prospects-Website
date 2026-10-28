import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../auth/middleware";
export const getFeeNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getSql } = await import("../db");
    return (await import("./fee-notifications.server")).feeNotificationWorkspace(
      await getSql(),
      context.userId,
      { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
    );
  });
export const sendFeeCatchup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        ids: z
          .array(z.string().regex(/^[a-f0-9]{64}$/))
          .min(1)
          .max(100),
      })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./fee-notifications.server")).queueFeeCatchup(
      await getSql(),
      context.userId,
      data.ids,
    );
  });
export const refreshFeeDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) }).strict())
  .handler(async ({ context, data }) => {
    const { getSql } = await import("../db");
    return (await import("./fee-notifications.server")).checkFeeDelivery(
      await getSql(),
      context.userId,
      data.id,
      { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
    );
  });
