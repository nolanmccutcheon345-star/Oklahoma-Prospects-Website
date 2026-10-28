import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
export const Route = createFileRoute("/api/tryout-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.TRYOUT_NOTIFICATIONS_SECRET;
        if (!secret) return new Response("Not configured", { status: 503 });
        const hash = (s: string) => createHash("sha256").update(s).digest();
        if (
          !timingSafeEqual(
            hash(request.headers.get("authorization") || ""),
            hash("Bearer " + secret),
          )
        )
          return new Response("Forbidden", { status: 403 });
        if (
          process.env.SQUARE_DEPLOY_CONTEXT !== "production" ||
          process.env.CONTEXT !== "production" ||
          new URL(request.url).origin !== "https://prospectssports.club"
        )
          return new Response("Production endpoint only", { status: 403 });
        if (process.env.TRYOUT_NOTIFICATIONS_ENABLED !== "true")
          return Response.json({ skipped: true });
        try {
          const { getSql } = await import("@/lib/db");
          const { deliverTryoutNotifications } = await import("@/lib/tryout-notifications.server");
          const sql = await getSql();
          const env = {
            ...process.env,
            SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT,
          };
          const invitations = await (
            await import("@/lib/invitation-delivery.server")
          ).deliverInvitationEmails(sql, env);
          const feeNotices = await (await import("@/lib/teams/fee-notifications.server")).deliverFeeReadyEmails(sql, env);
          const teamNotices = await (
            await import("@/lib/coordinator/communications.server")
          ).deliverTeamNotices(sql);
          const summary = await deliverTryoutNotifications(sql, env, fetch, 1);
          const center = await (
            await import("@/lib/tryout-center-delivery.server")
          ).deliverCenterNotifications(sql, env);
          const program = await (
            await import("@/lib/coordinator/program-notices.server")
          ).deliverProgramEventNotices(sql, env);
          return Response.json(
            { group: summary, center, teamNotices, program, invitations, feeNotices },
            {
              status:
                summary.failed || center.failed || program.failed || invitations.failed || feeNotices.failed ? 503 : 200,
            },
          );
        } catch {
          return new Response("Retry pending", { status: 503 });
        }
      },
    },
  },
});
