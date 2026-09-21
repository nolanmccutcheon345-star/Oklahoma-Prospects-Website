import { createFileRoute } from "@tanstack/react-router";
import { GET } from "@/lib/fundraising/dashboard";
export const Route = createFileRoute("/api/fundraising/dashboard")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
