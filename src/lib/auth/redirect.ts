/** Only allow same-origin application paths, including after percent decoding. */
export function safeNext(value: unknown, fallback = "/account") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("//") || (decoded.includes("\\") || [...decoded].some(c => c.charCodeAt(0) < 32))) return fallback;
    const base = "https://prospectsbaseball.club";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
