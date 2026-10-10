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
          const summary = await deliverTryoutNotifications(await getSql(), {
            ...process.env,
            SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT,
          });
          return Response.json(summary, { status: summary.failed ? 503 : 200 });
        } catch {
          return new Response("Retry pending", { status: 503 });
        }
      },
    },
  },
});
