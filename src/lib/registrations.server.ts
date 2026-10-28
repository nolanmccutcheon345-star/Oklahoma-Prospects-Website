import { registrationFilters, registrationFilterSql, type RegistrationFilters } from "./registration-filters";
import type { Sql } from "./db";
import { resolveIdentity } from "./identity.server";

export async function registrationAccessFor(sql: Sql, userId: string) {
  const me = await resolveIdentity(sql, userId);
  const [staff] = await sql<{
    approved: boolean;
  }>`select is_tryout_staff(${userId},${me.email}) as approved`;
  const [grant] = await sql<{ active: boolean }>`select active from registration_readers
    where user_id=${userId} and email=${me.email} and active=true`;
  const [coordinator] = await sql`select user_id from coordinator_assignments where user_id=${userId} and status<>'removed'`;
  return {
    allowed: me.role === "admin" || (!coordinator && (Boolean(staff?.approved) || (me.role !== "player" && !!grant))),
    owner: me.role === "admin",
  };
}

export async function registrationRowsFor(sql: Sql, userId: string, filters?: RegistrationFilters) {
  const access = await registrationAccessFor(sql, userId);
  if (!access.allowed)
    throw new Error("Registration viewing access is required. Ask a club owner.");
  const [reader] =
    await sql`select r.user_id from registration_readers r join "user" u on u.id=r.user_id where r.user_id=${userId} and r.active=true and r.email=lower(trim(u.email))`;
  const contactAccess = access.owner || Boolean(reader);
  // Allowlist both request kinds and payload fields. Billing/waiver/internal data
  // never reaches this endpoint, regardless of filters or future request kinds.
  const f=registrationFilters.parse(filters||{});
  const rows = await sql.query<{
    id: string;
    kind: string;
    status: string;
    created_at: Date;
    revision: number;
    payload: Record<string, unknown>;
  }>(`select r.id,r.kind,r.status,r.coordinator_revision as revision,r.created_at,r.payload from club_requests r
    where r.kind in ('tryout','team-inquiry','contact') and ($1::boolean or r.kind<>'contact') and ${registrationFilterSql('$2')}
    order by ${f.sort==='player'?"lower(r.payload->>'player'),":""} r.created_at desc,r.id desc limit 100 offset $3`,[contactAccess,JSON.stringify(f),f.page*100]);
  const fields = [
  "athleteId", "birthMonthYear", "birthYear", "graduationYear", "school", "schoolStatus", "suggestedDivision", "eligibilityStatus", "eligibilityExplanation", "eligibilityRule", "eligibilitySource", "eligibilityCutoff", "currentGrade", "profileConfirmedAt",
    "player",
    "parent",
    "name",
    "age",
    "sport",
    "session",
    "season",
    "email",
    "phone",
    "notes",
    "positions",
    "usssaStatus",
    "usssaAthleteId",
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
  return sql<{
    user_id: string;
    name: string;
    email: string;
    enabled: boolean;
    can_manage_tryouts: boolean;
  }>`
    select u.id as user_id,coalesce(nullif(p.name,''),u.name) as name,lower(u.email) as email,
      coalesce(r.active and r.email=lower(u.email),false) as enabled, coalesce(r.can_manage_tryouts,false) as can_manage_tryouts
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
    if (input.enabled && (await tx`select user_id from coordinator_assignments where user_id=${input.userId} and status<>'removed'`).length) throw new Error("Use scoped coordinator permissions instead of broad registration-reader access.");
    await tx`insert into registration_readers(user_id,email,active,granted_by)
      values(${input.userId},${user.email},${input.enabled},${actorId})
      on conflict(user_id) do update set email=excluded.email,active=excluded.active,
        granted_by=excluded.granted_by,can_manage_tryouts=case when excluded.active then registration_readers.can_manage_tryouts else false end,updated_at=now()`;
    return { ok: true };
  });
}
