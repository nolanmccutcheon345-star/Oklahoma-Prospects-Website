import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getSql } = await import("@/lib/db");
          const { visiblePublications } = await import("@/lib/journal/public.server");
          const rows = await visiblePublications(await getSql());
          const paths = [
            "/",
            "/book",
            "/memberships",
            "/training",
            "/teams",
            "/softball",
            "/tryouts",
            "/coaches",
            "/facility",
            "/more",
            "/contact",
            "/recruiting",
            "/privacy",
            "/baseball",
            "/instructors",
            "/events",
            "/games",
            "/merchandise",
            "/articles",
          ];
          const escape = (s: string) =>
            s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
          const xml =
            '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
            paths.map((p) => `<url><loc>https://prospectssports.club${p}</loc></url>`).join("") +
            rows
              .filter((r) => !r.document.noindex)
              .map(
                (r) =>
                  `<url><loc>https://prospectssports.club/articles/${escape(r.document.slug)}</loc><lastmod>${new Date(r.updated_at).toISOString()}</lastmod></url>`,
              )
              .join("") +
            "</urlset>";
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        } catch {
          return new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store", "Retry-After": "60" },
          });
        }
      },
    },
  },
});
