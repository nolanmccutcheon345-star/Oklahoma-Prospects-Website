import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/shop/images/$imageId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { getSql } = await import("@/lib/db");
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const user = await getSessionUser();
        const width = Number(new URL(request.url).searchParams.get("w") || "");
        return (await import("@/lib/shop/images.server")).shopImageResponse(
          await getSql(),
          params.imageId,
          user?.id || null,
          Number.isFinite(width) && width > 0 ? width : undefined,
        );
      },
    },
  },
});
