import { getSql } from "../db";
import type { ClubRecord } from "./types";
import type { publicTeamsView } from "./public-view";
export async function loadPublicClub(): Promise<ClubRecord | null> {
 const sql=await getSql();const [row]=await sql<{payload:ClubRecord;rev:number;demo:boolean}>`select payload,rev,demo from club_state where id='oklahoma-prospects'`;
 if(!row||row.demo)return null;const raw=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;return {...raw,_rev:row.rev,_demo:row.demo};
}
export async function enrichPublicCoaches(teams:ReturnType<typeof publicTeamsView>){
 if(!teams.length)return teams;const {publicPeople}=await import('../person-public.server');const people=await publicPeople();
 return teams.map(t=>({...t,coaches:people.flatMap(p=>{const a=p.teams.find(a=>a.id===t.id);return a?[{name:p.name,role:a.role,photo:p.photo,bio:[p.bio,p.approach,p.ages,p.achievements,p.welcome].filter(Boolean).join('\n\n')}]:[];})}));
}
