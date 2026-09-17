import { createFileRoute } from "@tanstack/react-router";
import { squareWebhook } from "@/lib/commerce/square-webhook.server";
export const Route = createFileRoute("/api/square/webhook")({
  server: { handlers: { POST: ({ request }) => squareWebhook(request) } },
});
