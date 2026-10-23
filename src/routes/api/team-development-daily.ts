import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
export const Route = createFileRoute("/api/team-development-daily")({
  server:{handlers:{POST:async({request})=>{
    const secret=process.env.TEAM_DEVELOPMENT_DAILY_SECRET;
    if(!secret)return new Response("Not configured",{status:503});
    const hash=(s:string)=>createHash("sha256").update(s).digest();
    if(!timingSafeEqual(hash(request.headers.get("authorization")||""),hash("Bearer "+secret)))
      return new Response("Forbidden",{status:403});
    if(process.env.CONTEXT!=="production"||new URL(request.url).origin!=="https://prospectssports.club")
      return new Response("Production endpoint only",{status:403});
    const {getSql}=await import("@/lib/db");
    const {runTeamDevelopmentDaily,shouldRunTeamDevelopmentDaily}=await import("@/lib/team-development/daily.server");
    if(!shouldRunTeamDevelopmentDaily())return Response.json({skipped:true});
    return Response.json(await runTeamDevelopmentDaily(await getSql()));
  }}}
});
