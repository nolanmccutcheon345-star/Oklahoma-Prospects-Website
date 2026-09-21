import { createFileRoute } from "@tanstack/react-router";
import { GET } from "@/lib/fundraising/export";
export const Route = createFileRoute("/api/fundraising/export")({
  server: { handlers: { GET: () => GET() } },
});
