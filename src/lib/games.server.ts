import { randomUUID } from "node:crypto";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { gameEventInput, type GameEventInput, type AdminGameEvent, type PublicGameEvent } from "./games-contracts";

const adminFields = `id::text,revision,sport,age_group as "ageGroup",team_name as "teamName",opponent,game_date::text as date,start_time as "startTime",venue,status,our_runs as "ourRuns",opp_runs as "oppRuns",inning,video_id as "videoId",video_kind as "videoKind",media_approved as "mediaApproved",published`;

/** No private roster/lineup/athlete details are stored in this domain. */
export function publicGameView(row: AdminGameEvent): PublicGameEvent {
  return {
    id:row.id,revision:row.revision,sport:row.sport,ageGroup:row.ageGroup,
    teamName:row.teamName,opponent:row.opponent,date:row.date,startTime:row.startTime,
    venue:row.venue,status:row.status,ourRuns:row.ourRuns,oppRuns:row.oppRuns,inning:row.inning,
    videoId:row.mediaApproved ? row.videoId : "",
    videoKind:row.mediaApproved ? row.videoKind : "none",
  };
}
export async function publicGamesFor(sql: Sql): Promise<PublicGameEvent[]> {
 try {
  const games=await sql.query<AdminGameEvent>(
   `select ${adminFields} from games_events
     where published=true and status<>'draft'
       and (game_date>=current_date-interval '18 months' or status='live')
     order by case when status='live' then 0 else 1 end,
              game_date desc,start_time desc,id limit 250`
  );
  const {publicTeamGames}=await import('./teams/activity.server');
  return [...games.map(publicGameView),...await publicTeamGames(sql)].sort((a,b)=>Number(b.status==='live')-Number(a.status==='live')||b.date.localeCompare(a.date));
 } catch(error) {
  // An unapplied new migration must render an honest empty state, not fake fixtures.
  if((error as {code?:string}).code==="42P01")return [];
  throw error;
 }
}
export async function adminGamesFor(sql: Sql,userId:string):Promise<AdminGameEvent[]>{
 if((await resolveIdentity(sql,userId)).role!=="admin")throw new Error("Owner access required.");
 return sql.query<AdminGameEvent>(
  `select ${adminFields} from games_events order by game_date desc,start_time desc,id limit 300`
 );
}
export async function saveGameFor(sql:Sql,userId:string,raw:GameEventInput){
 if((await resolveIdentity(sql,userId)).role!=="admin")throw new Error("Owner access required.");
 const g=gameEventInput.parse(raw);
 const id=g.id || randomUUID();
 return sql.transaction(async tx=>{
  if(g.revision===0){
   const added=await tx<{id:string}>`insert into games_events
    (id,sport,age_group,team_name,opponent,game_date,start_time,venue,status,
     our_runs,opp_runs,inning,video_id,video_kind,media_approved,published,updated_by)
    values (${id},${g.sport},${g.ageGroup},${g.teamName},${g.opponent},${g.date},${g.startTime},${g.venue},${g.status},
     ${g.ourRuns},${g.oppRuns},${g.inning},${g.videoId},${g.videoKind},${g.mediaApproved},${g.published},${userId})
    on conflict(id) do nothing returning id::text`;
   if(!added.length)throw new Error("Game ID already exists.");
  }else{
   const updated=await tx<{id:string}>`update games_events
    set sport=${g.sport},age_group=${g.ageGroup},team_name=${g.teamName},
    opponent=${g.opponent},game_date=${g.date},start_time=${g.startTime},
    venue=${g.venue},status=${g.status},our_runs=${g.ourRuns},opp_runs=${g.oppRuns},
    inning=${g.inning},video_id=${g.videoId},video_kind=${g.videoKind},
    media_approved=${g.mediaApproved},published=${g.published},
    revision=revision+1,updated_by=${userId},updated_at=now()
    where id=${id} and revision=${g.revision} returning id::text`;
   if(!updated.length)throw new Error("Another editor changed this game. Refresh before saving.");
  }
  return {id,ok:true};
 });
}
