import type { Config } from "@netlify/functions";
export default async () => {
  const secret = Netlify.env.get("SQUARE_RECONCILE_SECRET");
  const origin = Netlify.env.get("APP_BASE_URL");
  if (!secret || !origin) return new Response("Reconciliation is not configured", { status: 503 });
  const url = new URL("/api/square/reconcile", origin);
  if (url.protocol !== "https:") return new Response("Invalid origin", { status: 503 });
  const result = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + secret },
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  return new Response(result.ok ? "OK" : "Retry pending", { status: result.ok ? 200 : 503 });
};
export const config: Config = { schedule: "*/10 * * * *" };
