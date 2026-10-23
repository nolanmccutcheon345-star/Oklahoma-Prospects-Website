import type { Config } from "@netlify/functions";
export default async () => {
  if (Netlify.env.get("CONTEXT") !== "production") return new Response("Disabled");
  const secret=Netlify.env.get("TEAM_DEVELOPMENT_DAILY_SECRET");
  if(!secret)return new Response("Not configured",{status:503});
  try{
    const result=await fetch("https://prospectssports.club/api/team-development-daily",{
      method:"POST",headers:{Authorization:"Bearer "+secret},redirect:"error",signal:AbortSignal.timeout(25000),
    });
    return new Response(result.ok?"OK":"Retry pending",{status:result.ok?200:503});
  }catch{return new Response("Retry pending",{status:503});}
};
export const config: Config={schedule:"0 * * * *"};
