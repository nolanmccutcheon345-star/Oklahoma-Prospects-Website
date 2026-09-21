import { createFileRoute } from "@tanstack/react-router";
import { POST } from "@/lib/fundraising/players";
export const Route = createFileRoute("/api/fundraising/players")({
  server: { handlers: { POST: ({ request }) => POST(request) } },
});
