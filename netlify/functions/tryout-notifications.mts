import type { Config, Context } from "@netlify/functions";
export default async (_request: Request, context: Context) => {
  if (
    context.deploy.context !== "production" ||
    !context.deploy.published ||
    Netlify.env.get("TRYOUT_NOTIFICATIONS_ENABLED") !== "true"
  )
    return new Response("Disabled");
  const secret = Netlify.env.get("TRYOUT_NOTIFICATIONS_SECRET");
  if (!secret) return new Response("Not configured", { status: 503 });
  try {
    const result = await fetch("https://prospectssports.club/api/tryout-notifications", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret },
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    return new Response(result.ok ? "OK" : "Retry pending", { status: result.ok ? 200 : 503 });
  } catch {
    return new Response("Retry pending", { status: 503 });
  }
};
export const config: Config = { schedule: "* * * * *" };
