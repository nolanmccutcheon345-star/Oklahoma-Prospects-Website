import type { Config } from "@netlify/functions";
import { getSql } from "../../src/lib/db";
import {
  runTeamDevelopmentDaily,
  shouldRunTeamDevelopmentDaily,
} from "../../src/lib/team-development/daily.server";

export default async () => {
  if (Netlify.env.get("CONTEXT") !== "production") return new Response("Disabled");
  if (!shouldRunTeamDevelopmentDaily()) return new Response("Skipped");
  try {
    const result = await runTeamDevelopmentDaily(await getSql());
    return Response.json(result);
  } catch {
    return new Response("Retry pending", { status: 503 });
  }
};
export const config: Config = { schedule: "0 * * * *" };
