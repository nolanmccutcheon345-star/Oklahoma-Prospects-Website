import type { Sql } from "../db";

/** A stale roster email must not reinstate an explicitly deactivated coach.
 * Absence of a lesson-staff record is allowed for team-only coaches. Identity,
 * verification, restrictions and current team assignment are checked by callers. */
export async function coachNotDeactivated(sql: Sql, userId: string, email: string) {
  const [row] = await sql<{ inactive: boolean }>`select
    exists(select 1 from club_staff where active=false and (user_id=${userId}
      or (user_id='' and lower(trim(email))=${email})))
    or exists(select 1 from pd_working_file f cross join lateral jsonb_array_elements(coalesce(f.payload::jsonb->'coaches','[]')) c
      where f.id='club' and lower(trim(c->>'email'))=${email} and c->>'active'='false') as inactive`;
  return !row.inactive;
}
