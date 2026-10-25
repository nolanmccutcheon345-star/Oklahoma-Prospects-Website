import type { Config } from "@netlify/functions";
export default async () => {
  if (
    Netlify.env.get("CONTEXT") !== "production" ||
    Netlify.env.get("TEAM_AUTOPAY_ENABLED") !== "true" ||
    Netlify.env.get("TEAM_AUTOPAY_SANDBOX_VERIFIED") !== "true"
  )
    return new Response("Paused");
  const secret = Netlify.env.get("TRYOUT_NOTIFICATIONS_SECRET");
  if (!secret) return new Response("Not configured", { status: 503 });
  try {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch("https://prospectssports.club/api/team-collections", {
          method: "POST",
          headers: { Authorization: "Bearer " + secret },
          redirect: "error",
          signal: AbortSignal.timeout(25000),
        }),
      ),
    );
    const ok = results.every((r) => r.ok);
    return new Response(ok ? "OK" : "Review required", { status: ok ? 200 : 503 });
  } catch {
    return new Response("Review required", { status: 503 });
  }
};
export const config: Config = { schedule: "* * * * *" };
