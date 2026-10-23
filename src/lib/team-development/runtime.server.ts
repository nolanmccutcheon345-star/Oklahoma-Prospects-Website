import { randomUUID } from "node:crypto";
import { getSql, type Sql } from "../db";
import { ageOnClubDay } from "../pd/engines";
import { coachHoldsTeam } from "../teams/privacy";
import type { ClubRecord } from "../teams/types";
import { devScope, assertTeamDevelopmentCoach } from "./access.server";
import { assertProgramAssignable } from "./store.server";
import type { TeamDevAgeBand } from "./contracts";
import { resolveEffectiveAssignments, type TeamDevAssignmentScope } from "./resolution";

function ageBand(age:number):TeamDevAgeBand {
  if(age<=8)return "agp_6u-8u";
  if(age<=10)return "agp_9u-10u";
  if(age<=12)return "agp_11u-12u";
  if(age<=14)return "agp_13u-14u";
  return "agp_15u-17u";
}
function parseClub(payload:ClubRecord|string):ClubRecord {
  return typeof payload==="string"?JSON.parse(payload) as ClubRecord:payload;
}
function isoAdd(date:string,days:number) {
  const value=new Date(date+"T12:00:00Z"); value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
function scheduledDates(startDate:string,endDate:string,daysOfWeek:number[]) {
  const days=new Set(daysOfWeek);
  const out:string[]=[];
  for(let date=startDate;date<=endDate;date=isoAdd(date,1)) {
    const dow=new Date(date+"T12:00:00Z").getUTCDay();
    if(days.has(dow))out.push(date);
  }
  return out;
}
async function lateWindowDays(sql:Sql) {
  const [row]=await sql<{payload:{days?:number}}>`
    select payload from team_dev_config_items where id='late_credit_window_days' and active=true order by version desc limit 1
  `;
  const days=Number(row?.payload?.days);
  return Number.isSafeInteger(days)&&days>=0&&days<=30?days:7;
}
async function activeLinks(sql:Sql,teamId:string) {
  return sql<{athlete_id:string;roster_player_id:string}>`
    select athlete_id,roster_player_id from team_dev_roster_links
    where team_id=${teamId} and ended_at is null
  `;
}
async function assertNoHold(sql:Sql, athleteId:string) {
  const [pd]=await sql<{held:boolean}>`
    select exists(select 1 from training_assignments where athlete_id=${athleteId} and status='paused') as held
  `;
  const [td]=await sql<{held:boolean}>`
    select exists(select 1 from team_dev_items where athlete_id=${athleteId} and paused_reason is not null) as held
  `;
  if(pd?.held||td?.held)throw new Error("Resolve the existing training hold before assigning, replacing, or discontinuing activity.");
}

export async function createTeamDevelopmentAssignment(userId:string,input:{
  teamId:string;
  programType:string;
  scope:TeamDevAssignmentScope;
  programId:string;
  programVersion:number;
  startDate:string;
  endDate:string;
  daysOfWeek:number[];
  inheritNewPlayers?:boolean;
  position?:string;
  athleteIds?:string[];
}) {
  const sql=await getSql();
  const scope=await devScope(userId);
  assertTeamDevelopmentCoach(scope,input.teamId);
  return sql.transaction(async tx=>{
    await tx`select set_config('app.actor_id',${userId},true)`;
    const [clubRow]=await tx<{payload:ClubRecord|string;demo:boolean}>`
      select payload,demo from club_state where id='oklahoma-prospects' for update
    `;
    if(!clubRow||clubRow.demo)throw new Error("Club is not open.");
    const club=parseClub(clubRow.payload);
    const team=club.teams.find(t=>t.id===input.teamId&&!t.closed);
    if(!team)throw new Error("Team is not open.");
    if(input.endDate<input.startDate)throw new Error("End date must be on or after start date.");
    const daysOfWeek=[...new Set(input.daysOfWeek)].sort((a,b)=>a-b);
    if(!daysOfWeek.length||daysOfWeek.some(day=>!Number.isInteger(day)||day<0||day>6))
      throw new Error("Choose at least one weekly training day.");
    if(!scope.admin&&!coachHoldsTeam(club,(await import("../identity.server").then(m=>m.resolveIdentity(tx,userId))).email,team.id))
      throw new Error("Forbidden");

    const links=await activeLinks(tx,team.id);
    const rosterById=new Map(team.roster.map(player=>[player.id,player]));
    const linked=links.map(link=>({athleteId:link.athlete_id,player:rosterById.get(link.roster_player_id)})).filter(row=>row.player);
    let targets:{athleteId?:string;position?:string;targetKey:string}[]=[];
    if(input.scope==="team") {
      targets=input.inheritNewPlayers
        ? [{targetKey:"team:"+team.id}]
        : linked.map(row=>({athleteId:row.athleteId,targetKey:"athlete:"+row.athleteId}));
    } else if(input.scope==="position") {
      if(!input.position)throw new Error("Choose a position group.");
      targets=[{position:input.position,targetKey:"position:"+team.id+":"+input.position}];
    } else {
      const ids=[...new Set(input.athleteIds||[])];
      if(!ids.length)throw new Error("Choose at least one player.");
      const allowed=new Set(linked.map(row=>row.athleteId));
      if(ids.some(id=>!allowed.has(id)))throw new Error("A selected athlete is not linked to this team.");
      targets=ids.map(id=>({athleteId:id,targetKey:"athlete:"+id}));
    }

    const concreteIds = input.scope==="position"
      ? linked.filter(row=>row.player?.positions?.includes(input.position!)).map(row=>row.athleteId)
      : input.scope==="team" ? linked.map(row=>row.athleteId)
      : targets.map(t=>t.athleteId!).filter(Boolean);
    if(!concreteIds.length)throw new Error("No linked athletes match this assignment.");

    const birthdays=await tx<{id:string;birth_date:string|null}>`
      select id,birth_date::text from club_athletes where id=any(${concreteIds}::text[])
    `;
    const birthdayById=new Map(birthdays.map(row=>[row.id,row.birth_date]));
    const bands=new Set<TeamDevAgeBand>();
    for(const athleteId of concreteIds){
      await assertNoHold(tx,athleteId);
      const birth=birthdayById.get(athleteId);
      if(!birth)throw new Error("A recorded birthday is required before assigning team development.");
      bands.add(ageBand(ageOnClubDay(birth,input.startDate)));
    }
    for(const band of bands)await assertProgramAssignable(tx,input.programId,input.programVersion,band);

    for(const target of targets){
      const conflict=await tx<{id:string}>`
        select a.id from team_dev_assignment_targets t
        join team_dev_assignments a on a.id=t.assignment_id
        where t.active=true and t.target_key=${target.targetKey}
          and t.program_type=${input.programType} and t.scope=${input.scope}
          and a.status='active'
        limit 1
      `;
      if(conflict.length)throw new Error("A same-tier program already exists for this target and program type.");
    }

    const [version]=await tx<{payload:Record<string,unknown>}>`
      select payload from team_dev_program_versions where program_id=${input.programId} and version=${input.programVersion}
    `;
    if(!version)throw new Error("Program version not found.");
    const id=randomUUID();
    const schedule={daysOfWeek:[...new Set(input.daysOfWeek)].sort((a,b)=>a-b)};
    await tx`
      insert into team_dev_assignments(id,team_id,program_type,scope,program_id,program_version,program_snapshot,start_date,end_date,inherit_new_players,schedule,created_by)
      values(${id},${team.id},${input.programType},${input.scope},${input.programId},${input.programVersion},${JSON.stringify(version.payload)}::jsonb,${input.startDate},${input.endDate},${Boolean(input.inheritNewPlayers)},${JSON.stringify(schedule)}::jsonb,${userId})
    `;
    for(const target of targets)await tx`
      insert into team_dev_assignment_targets(assignment_id,athlete_id,position,target_key,program_type,scope,active)
      values(${id},${target.athleteId||null},${target.position||null},${target.targetKey},${input.programType},${input.scope},true)
    `;
    const trainingDates=scheduledDates(input.startDate,input.endDate,input.daysOfWeek);
    if(!trainingDates.length)throw new Error("The selected weekly days do not create any sessions inside the assignment dates.");
    const lateDays=await lateWindowDays(tx);
    for(const athleteId of concreteIds){
      for(const dueDate of trainingDates){
        const lateEnd=[input.endDate,isoAdd(dueDate,lateDays)].sort()[0];
        await tx`
          insert into team_dev_items(
            id,assignment_id,athlete_id,state,due_date,phase_end_date,late_credit_window_end,assignment_scope,payload
          ) values(
            ${randomUUID()},${id},${athleteId},'assigned',${dueDate},${input.endDate},${lateEnd},${input.scope},
            ${JSON.stringify({programId:input.programId,programVersion:input.programVersion,programType:input.programType,items:version.payload.items??[],phases:version.payload.phases??[]})}::jsonb
          )
        `;
      }
    }
    await tx`
      insert into team_dev_events(actor_id,team_id,entity_type,entity_id,action,after_json)
      values(${userId},${team.id},'assignment',${id},'assigned',${JSON.stringify({programId:input.programId,programVersion:input.programVersion,scope:input.scope,targets})}::jsonb)
    `;
    return {id};
  });
}

export async function endTeamDevelopmentAssignment(userId:string,assignmentId:string) {
  const sql=await getSql();
  const scope=await devScope(userId);
  return sql.transaction(async tx=>{
    const [assignment]=await tx<{id:string;team_id:string;status:string}>`
      select id,team_id,status from team_dev_assignments where id=${assignmentId} for update
    `;
    if(!assignment)throw new Error("Assignment not found.");
    assertTeamDevelopmentCoach(scope,assignment.team_id);
    const athleteIds=(await tx<{athlete_id:string|null}>`
      select athlete_id from team_dev_assignment_targets where assignment_id=${assignmentId} and athlete_id is not null
    `).map(x=>x.athlete_id!).filter(Boolean);
    for(const athleteId of athleteIds)await assertNoHold(tx,athleteId);
    await tx`update team_dev_assignments set status='ended',revision=revision+1,updated_at=now() where id=${assignmentId}`;
    await tx`update team_dev_assignment_targets set active=false where assignment_id=${assignmentId}`;
    await tx`insert into team_dev_events(actor_id,team_id,entity_type,entity_id,action,before_json,after_json)
      values(${userId},${assignment.team_id},'assignment',${assignmentId},'ended',${JSON.stringify({status:assignment.status})}::jsonb,'{"status":"ended"}'::jsonb)`;
    return {ok:true as const};
  });
}

export async function effectiveTeamDevelopmentForAthlete(userId:string,teamId:string,athleteId:string) {
  const scope=await devScope(userId);
  if(!scope.admin&&!scope.coachTeamIds.has(teamId)&&!scope.guardianAthleteIds.has(athleteId)&&scope.selfAthleteId!==athleteId)
    throw new Error("Forbidden");
  const sql=await getSql();
  const [clubRow]=await sql<{payload:ClubRecord|string;demo:boolean}>`select payload,demo from club_state where id='oklahoma-prospects'`;
  if(!clubRow||clubRow.demo)throw new Error("Club is not open.");
  const club=parseClub(clubRow.payload);
  const team=club.teams.find(t=>t.id===teamId);
  const link=(await sql<{roster_player_id:string}>`
    select roster_player_id from team_dev_roster_links
    where team_id=${teamId} and athlete_id=${athleteId} and ended_at is null
    limit 1
  `)[0];
  const player=team?.roster.find(p=>p.id===link?.roster_player_id);
  if(!team||!player)throw new Error("Athlete is not linked to this team.");
  const rows=await sql<{id:string;program_type:string;scope:TeamDevAssignmentScope;created_at:Date;athlete_id:string|null;position:string|null;target_key:string}>`
    select a.id,a.program_type,a.scope,a.created_at,t.athlete_id,t.position,t.target_key
    from team_dev_assignments a join team_dev_assignment_targets t on t.assignment_id=a.id
    where a.team_id=${teamId} and a.status='active' and t.active=true
    order by a.created_at
  `;
  const grouped=new Map<string,{id:string;program_type:string;scope:TeamDevAssignmentScope;created_at:Date;targets:{athlete_id?:string|null;position?:string|null;target_key:string}[]}>();
  for(const row of rows){
    const current=grouped.get(row.id)||{id:row.id,program_type:row.program_type,scope:row.scope,created_at:row.created_at,targets:[]};
    current.targets.push({athlete_id:row.athlete_id,position:row.position,target_key:row.target_key});
    grouped.set(row.id,current);
  }
  return resolveEffectiveAssignments([...grouped.values()],athleteId,player.positions||[],teamId);
}

export async function endRosterDevelopmentLink(
  tx:Sql,
  input:{teamId:string;rosterPlayerId:string;actorId:string},
) {
  const ended=await tx<{athlete_id:string}>`
    update team_dev_roster_links set ended_at=now(),ended_by=${input.actorId}
    where team_id=${input.teamId} and roster_player_id=${input.rosterPlayerId} and ended_at is null
    returning athlete_id
  `;
  for(const row of ended)await tx`
    insert into team_dev_events(actor_id,athlete_id,team_id,entity_type,entity_id,action,after_json)
    values(${input.actorId},${row.athlete_id},${input.teamId},'roster_link',${input.rosterPlayerId},'ended','{"ended":true}'::jsonb)
  `;
}
