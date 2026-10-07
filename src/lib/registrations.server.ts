import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";

export async function registrationAccessFor(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  const [grant] = await sql<{ active: boolean }>`select active from registration_readers
    where user_id=${userId} and email=${me.email} and active=true`;
  return { allowed: me.role !== "player" && (me.role === "admin" || !!grant), owner: me.role === "admin" };
}

export async function registrationRowsFor(sql: Sql, userId: string) {
  if (!(await registrationAccessFor(sql, userId)).allowed)
    throw new Error("Registration viewing access is required. Ask a club owner.");
  // Allowlist both request kinds and payload fields. Billing/waiver/internal data
  // never reaches this endpoint, regardless of filters or future request kinds.
  const rows = await sql<{
    id: string;
    kind: string;
    status: string;
    created_at: Date;
    payload: Record<string, unknown>;
  }>`
    select id,kind,status,created_at,payload from club_requests
    where kind in ('tryout','team-inquiry','contact') order by created_at desc,id desc limit 500`;
  const fields = [
    "player",
    "parent",
    "name",
    "age",
    "sport",
    "session",
    "email",
    "phone",
    "notes",
    "message",
  ];
  return rows.map((row) => ({
    ...row,
    payload: Object.fromEntries(
      fields.flatMap((key) =>
        typeof row.payload[key] === "string" ? [[key, row.payload[key] as string]] : [],
      ),
    ),
  }));
}

export async function registrationReadersFor(sql: Sql, userId: string) {
  if (!(await registrationAccessFor(sql, userId)).owner) throw new Error("Owner access required.");
  return sql<{ user_id: string; name: string; email: string; enabled: boolean }>`
    select u.id as user_id,coalesce(nullif(p.name,''),u.name) as name,lower(u.email) as email,
      coalesce(r.active and r.email=lower(u.email),false) as enabled
    from "user" u left join profiles p on p.user_id=u.id
    left join registration_readers r on r.user_id=u.id
    where u."disabledAt" is null and u."emailVerified"=true
    order by lower(u.email)`;
}

export async function setRegistrationReaderFor(
  sql: Sql,
  actorId: string,
  input: { userId: string; enabled: boolean },
) {
  if ((await resolveIdentity(sql, actorId)).role !== "admin")
    throw new Error("Owner access required.");
  return sql.transaction(async (tx) => {
    const [user] = await tx<{ email: string }>`select lower(u.email) as email from "user" u
      where u.id=${input.userId} and "disabledAt" is null and "emailVerified"=true and (${!input.enabled} or not exists(select 1 from profiles p where p.user_id=u.id and p.role='player')) for update`;
    if (!user) throw new Error("Choose an active non-player account with a verified email.");
    await tx`insert into registration_readers(user_id,email,active,granted_by)
      values(${input.userId},${user.email},${input.enabled},${actorId})
      on conflict(user_id) do update set email=excluded.email,active=excluded.active,
        granted_by=excluded.granted_by,updated_at=now()`;
    return { ok: true };
  });
}
