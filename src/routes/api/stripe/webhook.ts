import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/stripe/webhook")({
  server: { handlers: { POST: () => new Response("Payment processor retired", { status: 410 }) } },
});
