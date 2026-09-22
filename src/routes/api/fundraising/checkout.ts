import { createFileRoute } from "@tanstack/react-router";
import { POST } from "@/lib/fundraising/checkout";
export const Route = createFileRoute("/api/fundraising/checkout")({
  server: { handlers: { POST: ({ request }) => POST(request) } },
});
