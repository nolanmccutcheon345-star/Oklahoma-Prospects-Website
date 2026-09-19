import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { flushSiteAlerts } from "@/lib/site-alerts.server";
export const Route = createFileRoute("/api/site-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SQUARE_RECONCILE_SECRET;
        if (!secret) return new Response("Alerts not configured", { status: 503 });
        const hash = (s: string) => createHash("sha256").update(s).digest();
        if (
          !timingSafeEqual(
            hash(request.headers.get("authorization") || ""),
            hash("Bearer " + secret),
          )
        )
          return new Response("Forbidden", { status: 403 });
        try {
          const { getSql } = await import("@/lib/db");
          const { squareConfig } = await import("@/lib/commerce/square.server");
          const { sendPaymentNotifications } = await import("@/lib/commerce/square-office.server");
          const { recordRecoveryRun, recoveryHealth } =
            await import("@/lib/commerce/recovery-health.server");
          const sql = await getSql(),
            c = squareConfig();
          if (process.env.CONTEXT !== "production" || c.environment !== "production")
            return Response.json({ ok: true, skipped: true });
          const summary = await recordRecoveryRun(sql, c.environment, "notifications", async () => {
            const payments = await sendPaymentNotifications();
            const alerts = await flushSiteAlerts();
            const health = await recoveryHealth(sql, c.environment);
            const emails = health.queues.filter((q) => q.kind.endsWith("emails"));
            return {
              failures: emails.reduce((n, q) => n + q.pending + q.review, 0),
              paymentEmailsAccepted: payments.length,
              staffEmailsAccepted: alerts.length,
            };
          });
          return Response.json({ ok: true, ...summary });
        } catch {
          return new Response("Retry pending", { status: 503 });
        }
      },
    },
  },
});
