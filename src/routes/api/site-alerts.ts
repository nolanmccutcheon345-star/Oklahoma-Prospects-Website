import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual, createHash } from "node:crypto";
import { flushSiteAlerts, siteAlertsEnabled } from "@/lib/site-alerts.server";
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
          if (c.environment !== "production") return Response.json({ ok: true, skipped: true });
          const { runScheduledCoordinatorReviews } =
            await import("@/lib/coordinator/scheduled-reviews.server");
          const { runCoordinatorRiskChecks } =
            await import("@/lib/coordinator/risk-reviews.server");
          const risks = await runCoordinatorRiskChecks(sql);
          const reviews = await runScheduledCoordinatorReviews(sql);
          const { archiveStaffActivity, recordArchiveProblem } =
            await import("@/lib/coordinator/security-archive.server");
          let archive: { configured: boolean; archived: number; failed?: boolean };
          try {
            archive = await archiveStaffActivity(sql, process.env);
          } catch {
            archive = { configured: true, archived: 0, failed: true };
            await recordArchiveProblem(sql);
          }

          if (!siteAlertsEnabled())
            return Response.json(
              {
                ok: !archive.failed,
                skipped: true,
                coordinatorArchive: archive,
                coordinatorReviewRuns: reviews.created,
                coordinatorRiskAlerts: risks.created,
              },
              { status: archive.failed ? 503 : 200 },
            );
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
          return Response.json(
            { ok: !archive.failed, coordinatorArchive: archive, ...summary },
            { status: archive.failed ? 503 : 200 },
          );
        } catch {
          return new Response("Retry pending", { status: 503 });
        }
      },
    },
  },
});
