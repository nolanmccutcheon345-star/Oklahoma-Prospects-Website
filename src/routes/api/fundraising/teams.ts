import { createFileRoute } from "@tanstack/react-router";
import { GET } from "@/lib/fundraising/roster-api";
export const Route = createFileRoute("/api/fundraising/teams")({
  server: { handlers: { GET: ({ request }) => GET(request) } },
});
