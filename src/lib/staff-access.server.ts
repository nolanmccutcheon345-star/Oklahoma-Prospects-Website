import type { Sql } from './db';

/** Use inside the staff mutation transaction, including pending invitations. */
export async function revokeStaffAccess(sql: Sql, staff: { user_id: string; email: string }) {
  await sql`update club_invites set status='revoked'
    where lower(trim(email))=lower(trim(${staff.email})) and role='coach' and status='pending'`;
  await sql`update person_profiles set instructor=false,publish_instructor=false,revision=revision+1 where user_id in (select id from "user" where id=${staff.user_id} or lower(trim(email))=lower(trim(${staff.email})))`;
  if (staff.user_id) {
    await sql`update profiles set role='parent' where user_id=${staff.user_id} and role='coach'`;
    await sql`delete from "session" where "userId"=${staff.user_id}`;
  }
}
