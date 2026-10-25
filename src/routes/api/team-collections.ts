import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
export const Route = createFileRoute("/api/team-collections")({
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
        try {
          const { squareConfig, squareClient } = await import("@/lib/commerce/square.server");
          const { getSql } = await import("@/lib/db");
          const { runTeamCollections, teamCollectionsEnabled } =
            await import("@/lib/teams/collections.server");
          const c = squareConfig();
          return Response.json(
            await runTeamCollections(await getSql(), squareClient(), c, {
              enabled: teamCollectionsEnabled(
                { ...process.env, SQUARE_DEPLOY_CONTEXT: process.env.SQUARE_DEPLOY_CONTEXT },
                c.environment,
              ),
            }),
          );
        } catch {
          return new Response("Collection requires review", { status: 503 });
        }
      },
    },
  },
});
