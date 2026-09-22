import { createFileRoute } from "@tanstack/react-router";
import { fundraisingSquareWebhook } from "@/lib/fundraising/webhook.server";
export const Route = createFileRoute("/api/square/webhook")({
  server: { handlers: { POST: ({ request }) => fundraisingSquareWebhook(request) } },
});
