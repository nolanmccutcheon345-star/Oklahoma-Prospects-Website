import { createFileRoute } from "@tanstack/react-router";
import { POST } from "@/lib/fundraising/receipt";
export const Route = createFileRoute("/api/fundraising/receipt")({
  server: { handlers: { POST: ({ request }) => POST(request) } },
});
