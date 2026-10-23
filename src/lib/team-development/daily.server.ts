import { chicagoDate, CLUB_TIME_ZONE } from "../scheduling";
import { dailyTransition, type TeamDevCompletionState } from "./states";
import type { Sql } from "../db";

function chicagoHour(now:Date) {
  const part=new Intl.DateTimeFormat("en-US",{timeZone:CLUB_TIME_ZONE,hour:"2-digit",hourCycle:"h23"}).formatToParts(now).find(p=>p.type==="hour")?.value;
  return Number(part);
}
export async function runTeamDevelopmentDaily(sql:Sql,now=new Date()) {
  const today=chicagoDate(now);
  const rows=await sql.query<{
    id:string;state:TeamDevCompletionState;due_date:string;phase_end_date:string;
    late_credit_window_end:string;paused_reason:string|null;athlete_id:string;assignment_id:string;
  }>(
    "select id,state,due_date::text,phase_end_date::text,late_credit_window_end::text,paused_reason,athlete_id,assignment_id from team_dev_items where state in ('assigned','started','modified','missed')"
  );
  let changed=0;
  await sql.transaction(async tx=>{
    await tx.query("select set_config('app.actor_id',$1,true)",["team-development-daily"]);
    for(const row of rows){
      const next=dailyTransition({
        state:row.state,dueDate:row.due_date,phaseEndDate:row.phase_end_date,
        lateCreditWindowEnd:row.late_credit_window_end,today,paused:Boolean(row.paused_reason),
      });
      if(next===row.state)continue;
      await tx.query("update team_dev_items set state=$1,revision=revision+1,updated_at=now() where id=$2 and state=$3",[next,row.id,row.state]);
      await tx.query(
        "insert into team_dev_events(actor_id,athlete_id,entity_type,entity_id,action,before_json,after_json,metadata) values($1,$2,'item',$3,'daily_transition',$4::jsonb,$5::jsonb,$6::jsonb)",
        ["team-development-daily",row.athlete_id,row.id,JSON.stringify({state:row.state}),JSON.stringify({state:next}),JSON.stringify({clubDate:today})],
      );
      changed++;
    }
  });
  return {clubDate:today,changed,optionalNotificationsSent:0};
}

/**
 * Netlify calls hourly because cron has no America/Chicago timezone. Only the
 * 08:00 CT invocation performs the daily pass; all other invocations no-op.
 */
export function shouldRunTeamDevelopmentDaily(now=new Date()) {
  return chicagoHour(now)===8;
}
