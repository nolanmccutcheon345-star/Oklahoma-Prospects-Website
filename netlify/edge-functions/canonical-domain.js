/** Preserve signed provider callbacks and in-flight POSTs on the old host. */
export default function canonicalDomain(request) {
  const url = new URL(request.url);
  if (!["prospectsbaseball.club", "www.prospectsbaseball.club", "www.prospectssports.club"].includes(url.hostname)) return;
  if (!["GET", "HEAD"].includes(request.method)) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return;
  url.protocol = "https:";
  url.hostname = "prospectssports.club";
  url.port = "";
  return Response.redirect(url, 301);
}

export const config = {
  path: "/*",
  excludedPath: ["/api/*", "/.netlify/*"],
  header: { host: "^(www\\.)?(prospectsbaseball|prospectssports)\\.club$" },
};
