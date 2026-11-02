// Netlify's redirect proxy otherwise reattaches the original query to the
// server-renderer's clean Location header. End the chain before that proxy.
export default function contactQuery(request) {
  if (!["GET", "HEAD"].includes(request.method)) return;
  const url = new URL(request.url);
  if (!["/contact", "/contact/"].includes(url.pathname)) return;
  const subject = url.searchParams.get("subject");
  if (subject === null || subject.trim()) return;
  url.searchParams.delete("subject");
  return new Response(null, {
    status: 301,
    headers: { Location: url.href, "Cache-Control": "private, no-store" },
  });
}

export const config = { path: ["/contact", "/contact/"] };
