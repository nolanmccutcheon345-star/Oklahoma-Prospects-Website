import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
export async function centerAccessFor(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  const [staff] =
    await sql`select id from club_staff where active=true and role in ('coach','admin') and lower(trim(email))=${me.email} and (user_id='' or user_id=${userId})`;
  const [grant] = await sql<{
    can_manage_tryouts: boolean;
  }>`select can_manage_tryouts from registration_readers where user_id=${userId} and email=${me.email} and active=true`;
  const allowed =
    me.role !== "player" &&
    (me.role === "admin" || Boolean(staff) || Boolean(grant?.can_manage_tryouts));
  if (!allowed)
    throw new Error(
      "Active coach or tryout coordinator access is required with an active staff assignment. Ask an owner.",
    );
  return me;
}
