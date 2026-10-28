import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/journal/images/$imageId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { getSql } = await import("@/lib/db");
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const user = await getSessionUser();
        return (await import("@/lib/journal/media.server")).mediaResponse(
          await getSql(),
          params.imageId,
          user?.id || null,
        );
      },
    },
  },
});
