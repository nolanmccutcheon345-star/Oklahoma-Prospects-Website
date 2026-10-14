import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
export const Route = createFileRoute("/api/shop/fulfill")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SHOP_WORKER_SECRET;
        const digest = (v: string) => createHash("sha256").update(v).digest();
        if (
          !secret ||
          !timingSafeEqual(
            digest(request.headers.get("authorization") || ""),
            digest("Bearer " + secret),
          )
        )
          return new Response("Unauthorized", { status: 401 });
        try {
          const { getSql } = await import("@/lib/db");
          const { processShopOrders } = await import("@/lib/shop/fulfillment.server");
          return Response.json(await processShopOrders(await getSql()), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch {
          return new Response("Shop not ready", { status: 503 });
        }
      },
    },
  },
});
