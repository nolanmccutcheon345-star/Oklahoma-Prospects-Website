import type { Config } from "@netlify/functions";
export default async () => {
  if (
    Netlify.env.get("CONTEXT") !== "production" ||
    Netlify.env.get("MERCH_LIVE_ACCEPTED") !== "true"
  )
    return new Response("Disabled");
  const secret = Netlify.env.get("SHOP_WORKER_SECRET");
  if (!secret) return new Response("Not configured", { status: 503 });
  try {
    const r = await fetch("https://prospectssports.club/api/shop/fulfill", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret },
      signal: AbortSignal.timeout(25000),
      redirect: "error",
    });
    return new Response(r.ok ? "OK" : "Retry pending", { status: r.ok ? 200 : 503 });
  } catch {
    return new Response("Retry pending", { status: 503 });
  }
};
export const config: Config = { schedule: "*/5 * * * *" };
