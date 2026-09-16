import type { Sql } from './db';

/** Use inside the staff mutation transaction, including pending invitations. */
export async function revokeStaffAccess(sql: Sql, staff: { user_id: string; email: string }) {
  await sql`update club_invites set status='revoked'
    where lower(email)=lower(${staff.email}) and role='coach' and family_id is null and status='pending'`;
  if (staff.user_id) {
    await sql`update profiles set role='parent' where user_id=${staff.user_id} and role='coach'`;
    await sql`delete from "session" where "userId"=${staff.user_id}`;
  }
}
