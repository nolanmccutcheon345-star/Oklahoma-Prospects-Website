import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";
export async function centerAccessFor(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  const [staff] = await sql<{
    approved: boolean;
  }>`select is_tryout_staff(${userId},${me.email}) as approved`;
  const [grant] = await sql<{
    can_manage_tryouts: boolean;
  }>`select can_manage_tryouts from registration_readers where user_id=${userId} and email=${me.email} and active=true`;
  const [coordinator] = await sql`select user_id from coordinator_assignments where user_id=${userId} and status<>'removed'`;
  if (coordinator && me.role !== "admin") throw new Error("Use the scoped Coordinator Front Office for recruiting access.");
  const allowed =
    me.role === "admin" ||
    Boolean(staff?.approved) ||
    (me.role !== "player" && Boolean(grant?.can_manage_tryouts));
  if (!allowed)
    throw new Error(
      "Active coach or tryout coordinator access is required with an active staff assignment. Ask an owner.",
    );
  return me;
}
