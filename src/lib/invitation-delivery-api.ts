import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { operationalAuthMiddleware } from "./auth/middleware";
const input = z.object({ id: z.string().uuid() }).strict();
const env = () => ({ ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT });
export const reviewInvitationEmail = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(input)
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { prepareInvitationEmail } = await import("./invitation-delivery.server");
    return prepareInvitationEmail(await getSql(), context.userId, data.id, env());
  });
export const sendReviewedInvitation = createServerFn({ method: "POST" })
  .middleware([operationalAuthMiddleware])
  .validator(
    input
      .extend({ digest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) })
      .strict(),
  )
  .handler(async ({ context, data }) => {
    const { getSql } = await import("./db");
    const { rateLimit } = await import("./commerce/checkout.server");
    await rateLimit("account-invitation-email", 20);
    const { sendReviewedInvitationEmail } = await import("./invitation-delivery.server");
    return sendReviewedInvitationEmail(await getSql(), context.userId, data.id, data.digest, env());
  });
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
    const { noticeReleaseAllowed } = await import("./notifications/release-control.server");
    const approved = await noticeReleaseAllowed(sql, "invitation", data.id, env());
    return {
      status:
        sent.accepted || queued.status === "accepted"
          ? "accepted"
          : approved
            ? queued.status
            : "held for owner review",
      skipped: sent.skipped,
    };
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
