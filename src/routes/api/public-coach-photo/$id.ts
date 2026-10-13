import { createFileRoute } from "@tanstack/react-router";
import { publicCoachPhotoResponse } from "@/lib/public-coach-photo.server";
import { publicPeopleFor } from "@/lib/person-public.server";
import { getSql } from "@/lib/db";
export const Route = createFileRoute("/api/public-coach-photo/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        publicCoachPhotoResponse(request, params.id, async () => publicPeopleFor(await getSql())),
    },
  },
});
