import { createFileRoute } from "@tanstack/react-router";
import { POST } from "@/lib/fundraising/reconcile";
export const Route = createFileRoute("/api/fundraising/reconcile")({
  server: { handlers: { POST: ({ request }) => POST(request) } },
});
