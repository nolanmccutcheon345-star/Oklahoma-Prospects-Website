import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/** Owner-only directory of existing lesson coaches and staff; emails never enter public responses. */
export const getAssignableTeamCoaches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { clubIdentity } = await import("@/lib/identity.server");
    const me = await clubIdentity(context.userId);
    if (me.role !== "admin") throw new Error("Front office only.");
    const { readWorkingFile } = await import("@/lib/pd/desk-impl.server");
    const { listStaffDirectory } = await import("@/lib/staff-directory.server");
    const [desk, staff] = await Promise.all([readWorkingFile(), listStaffDirectory(context.userId)]);
    const combined = [
      ...desk.coaches.filter(c => c.active !== false).map(c => ({ name: c.name, email: c.email, source: "Lesson coach" })),
      ...staff.map(c => ({ name: c.name, email: c.email, source: "Staff directory" })),
    ];
    return Array.from(new Map(combined.filter(c => c.email?.includes("@")).map(c => [c.email.trim().toLowerCase(), { ...c, email: c.email.trim().toLowerCase() }])).values()).sort((a,b) => a.name.localeCompare(b.name));
  });

/** Public team-coaching identities: only names and team details, never email or private records. */
export const getPublicTeamCoaches = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const [row] = await sql<{ payload: unknown; demo: boolean }>`select payload,demo from club_state where id='oklahoma-prospects'`;
  if (!row || row.demo) return [] as { name: string; teams: { id: string; name: string; sport: "baseball" | "softball"; age: string }[] }[];
  const raw = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  const teams = (raw && typeof raw === "object" && Array.isArray((raw as { teams?: unknown }).teams)) ? (raw as { teams: unknown[] }).teams : [];
  const coaches = new Map<string, { name: string; bio?: string; photo?: string; teams: { id: string; name: string; sport: "baseball" | "softball"; age: string }[] }>();
  for (const candidate of teams) {
    if (!candidate || typeof candidate !== "object") continue;
    const t = candidate as Record<string, unknown>;
    if (t.closed === true || typeof t.id !== "string" || typeof t.name !== "string" || (t.sport !== "baseball" && t.sport !== "softball") || typeof t.age !== "string") continue;
    const summary = { id: t.id, name: t.name, sport: t.sport as "baseball" | "softball", age: t.age };
    const members: { name: string; email: string; bio?: string; photo?: string }[] = [];
    if (typeof t.headCoach === "string" && typeof t.coachEmail === "string") members.push({ name: t.headCoach, email: t.coachEmail, bio: typeof t.headCoachBio==="string"?t.headCoachBio:"", photo:typeof t.headCoachPhoto==="string"?t.headCoachPhoto:"" });
    if (Array.isArray(t.staff)) for (const person of t.staff) {
      if (person && typeof person === "object" && typeof person.name === "string" && typeof person.email === "string") members.push({ name: person.name, email: person.email, bio:typeof person.bio==="string"?person.bio:"", photo:typeof person.photo==="string"?person.photo:"" });
    }
    for (const person of members) {
      const email = person.email.trim().toLowerCase(), name = person.name.trim();
      if (!email.includes("@") || !name || name.length > 150) continue;
      const existing: {name:string;bio?:string;photo?:string;teams:{id:string;name:string;sport:"baseball"|"softball";age:string}[]} = coaches.get(email) ?? { name, bio:person.bio, photo:person.photo, teams: [] };
      if (!existing.teams.some(team => team.id === summary.id)) existing.teams.push(summary);
      coaches.set(email, existing);
    }
  }
  return [...coaches.values()].sort((a,b) => a.name.localeCompare(b.name));
});

const photoInput = z.union([z.literal(""), z.string().max(250000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/)]);
export const saveTeamCoachProfile = createServerFn({method:"POST"})
 .middleware([authMiddleware])
 .validator(z.object({email:z.string().email(),name:z.string().trim().min(1).max(120),bio:z.string().max(2000),photo:photoInput}).strict())
 .handler(async({context,data})=>{
   const {clubIdentity}=await import("@/lib/identity.server");
   const me=await clubIdentity(context.userId);
   const email=data.email.trim().toLowerCase();
   if(me.role!=="admin" && (me.role!=="coach" || me.email!==email))throw new Error("Not permitted to edit this coach.");
   const {getSql}=await import("@/lib/db");const sql=await getSql();
   const [row]=await sql<{payload:unknown;rev:number;demo:boolean}>`select payload,rev,demo from club_state where id='oklahoma-prospects'`;
   if(!row||row.demo)throw new Error("Club unavailable.");
   const club=typeof row.payload==="string"?JSON.parse(row.payload):row.payload;
   if(!club||!Array.isArray(club.teams))throw new Error("Invalid club.");
   let matched=false;
   for(const team of club.teams){
     if(team.closed)continue;
     if(typeof team.coachEmail==="string"&&team.coachEmail.toLowerCase()===email){
       team.headCoach=data.name;team.headCoachBio=data.bio;team.headCoachPhoto=data.photo;matched=true;
     }
     if(Array.isArray(team.staff))for(const person of team.staff){
       if(typeof person.email==="string"&&person.email.toLowerCase()===email){
         person.name=data.name;person.bio=data.bio;person.photo=data.photo;matched=true;
       }
     }
   }
   if(!matched)throw new Error("Coach is not assigned to a team.");
   const result=await sql`update club_state set payload=${JSON.stringify({...club,_rev:row.rev+1,_savedAt:new Date().toISOString()})}::jsonb,rev=${row.rev+1},updated_at=now() where id='oklahoma-prospects' and rev=${row.rev} returning rev`;
   if(!result.length)throw new Error("Another edit was saved. Reload and try again.");
   return {ok:true as const};
 });
