import { createFileRoute } from "@tanstack/react-router";
import { GET, PATCH } from "@/lib/fundraising/players-player";
export const Route = createFileRoute("/api/fundraising/players/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => GET(request, { params: Promise.resolve(params) }),
      PATCH: ({ request, params }) => PATCH(request, { params: Promise.resolve(params) }),
    },
  },
});
