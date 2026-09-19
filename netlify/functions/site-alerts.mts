import type { Config } from "@netlify/functions";
export default async () => {
  const secret = Netlify.env.get("SQUARE_RECONCILE_SECRET"),
    origin = Netlify.env.get("APP_BASE_URL");
  if (!secret || !origin) return new Response("Alerts not configured", { status: 503 });
  const url = new URL("/api/site-alerts", origin);
  if (url.protocol !== "https:") return new Response("Invalid origin", { status: 503 });
  try {
    const result = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + secret },
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    console.info("site-alerts endpoint completed", { status: result.status });
    return new Response(result.ok ? "OK" : "Retry pending", { status: result.ok ? 200 : 503 });
  } catch {
    console.error("site-alerts endpoint unavailable or timed out");
    return new Response("Retry pending", { status: 503 });
  }
};
export const config: Config = { schedule: "* * * * *" };
