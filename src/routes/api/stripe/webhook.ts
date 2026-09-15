import { createFileRoute } from "@tanstack/react-router";
import { stripeWebhook } from "@/lib/commerce/webhook.server";
export const Route = createFileRoute("/api/stripe/webhook")({ server: { handlers: { POST: ({ request }) => stripeWebhook(request) } } });
