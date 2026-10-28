import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { operationalAuthMiddleware } from "./auth/middleware";
const input = z.object({ id: z.string().uuid() }).strict();
export const sendInvitationEmail = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { rateLimit } = await import("./commerce/checkout.server");
    await rateLimit("account-invitation-email", 20);
    const { queueInvitationEmail, deliverInvitationEmails } =
      await import("./invitation-delivery.server");
    const sql = await getSql();
    const queued = await queueInvitationEmail(sql, context.userId, data.id);
    const sent = await deliverInvitationEmails(
      sql,
      { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
      fetch,
      data.id,
    );
    return { status: sent.accepted ? "accepted" : queued.status, skipped: sent.skipped };
  });
export const checkInvitationDelivery = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { rateLimit } = await import("./commerce/checkout.server");
    await rateLimit("account-invitation-status", 30);
    const { invitationDeliveryStatus } = await import("./invitation-delivery.server");
    return invitationDeliveryStatus(await getSql(), context.userId, data.id, {
      ...process.env,
      SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT,
    });
  });
