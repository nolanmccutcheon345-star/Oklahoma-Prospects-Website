import type { Sql } from "./db";
import type { Profile } from "./club-data";

type AccountViewer = { userId: string; email: string; role: Profile["role"] };

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
