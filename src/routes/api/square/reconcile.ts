import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { reconcileSquare } from "@/lib/commerce/square-office.server";
export const Route = createFileRoute("/api/square/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SQUARE_RECONCILE_SECRET;
        if (!secret) return new Response("Reconciliation is not configured", { status: 503 });
        const actual = createHash("sha256")
          .update(request.headers.get("authorization") || "")
          .digest();
        const expected = createHash("sha256")
          .update("Bearer " + secret)
          .digest();
        if (!timingSafeEqual(actual, expected)) return new Response("Forbidden", { status: 403 });
        try {
          const summary = await reconcileSquare();
          return Response.json({ ok: true, ...summary });
        } catch {
          return new Response("Retry pending", { status: 503 });
        }
      },
    },
  },
});
