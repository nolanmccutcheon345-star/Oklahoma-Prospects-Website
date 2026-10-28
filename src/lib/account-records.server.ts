import {validatePlayerBirthday} from './player-birthdays.server';
import type { Sql } from "./db";
import type { Profile } from "./club-data";

type AccountViewer = { userId: string; email: string; role: Profile["role"] };

/** The player_name field currently selects a household athlete; players cannot relink it. */
export async function saveAccountProfile(
  sql: Sql,
  viewer: AccountViewer & { familyId: string },
  input: { name: string; role: Profile["role"]; playerName: string; birthDate?:string },
) {
  if (viewer.role === "player") {
    const rows = await sql`update profiles set name = ${input.name}
      where user_id = ${viewer.userId} returning user_id`;
    if (!rows.length) throw new Error("Your player profile must be linked by the club before editing it.");
    return { ok: true, role: viewer.role };
  }
  const [existing]=await sql`select user_id from profiles where user_id=${viewer.userId}`;
  const newPlayer=!existing && viewer.role==='parent' && input.role==='player';
  if(newPlayer) validatePlayerBirthday(input.birthDate||'');
  // Preserve the existing initial player/parent setup, without allowing role escalation.
  const role = viewer.role === "parent" && input.role === "player" ? "player" : viewer.role;
  await sql.transaction(async tx=>{
  await tx`insert into profiles (user_id, name, email, role, player_name, family_id)
    values (${viewer.userId}, ${input.name}, ${viewer.email}, ${role}, ${input.playerName}, ${viewer.familyId})
    on conflict (user_id) do update set name = excluded.name, player_name = excluded.player_name`;
  if(newPlayer) {
    const id=`player:${viewer.userId}`;
    await tx`insert into club_athletes(id,user_id,household_email,name,birth_date) values(${id},${viewer.userId},${viewer.email},${input.playerName||input.name},${input.birthDate!})`;
    await tx`insert into person_player_links(user_id,player_id) values(${viewer.userId},${id})`;
  }
  });
  return { ok: true, role };
}

/** Project only account fields the workspace uses; never serialize the whole row. */
export async function readAccountProfile(sql: Sql, viewer: AccountViewer): Promise<Profile | null> {
  const player = viewer.role === "player";
  const [row] = await sql<Profile>`select user_id, name, player_name, assessment_complete,
    case when ${player} then 0 else lesson_credits end as lesson_credits,
    case when ${player} then 0 else remote_credits end as remote_credits,
    case when ${player} then '' else plan_name end as plan_name,
    case when ${player} then 0 else plan_price end as plan_price
    from profiles where user_id = ${viewer.userId}`;
  return row ? { ...row, email: viewer.email, role: viewer.role } : null;
}

type LegacyAppointment = {
  id: number; user_id: string; kind: string; title: string; date: string;
  start_time: string; duration_min: number; price: number; status: string;
};

/** Keep player schedule details without exposing prices. Zero is a compatibility placeholder. */
export async function readLegacySchedule(sql: Sql, viewer: AccountViewer) {
  // Legacy reservations have no coach assignment. Only front office can see all.
  if (viewer.role === "admin") {
    return sql<LegacyAppointment>`select id, user_id, kind, title, date, start_time, duration_min, price, status
      from reservations order by date desc, start_time desc`;
  }
  return sql<LegacyAppointment>`select id, user_id, kind, title, date, start_time, duration_min,
    case when ${viewer.role === "player"} then 0 else price end as price, status
    from reservations where user_id = ${viewer.userId} order by date desc, start_time desc`;
}
