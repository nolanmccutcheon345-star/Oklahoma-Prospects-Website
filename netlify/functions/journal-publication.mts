import type { Config } from "@netlify/functions";
import { getSql } from "../../src/lib/db";
import { publishScheduledFor } from "../../src/lib/journal/editorial.server";
export default async () => {
  if (Netlify.env.get("CONTEXT") !== "production") return new Response("Disabled");
  try {
    return Response.json(await publishScheduledFor(await getSql()));
  } catch {
    return new Response("Retry pending", { status: 503 });
  }
};
export const config: Config = { schedule: "* * * * *" };
