import { randomUUID } from "node:crypto";
import type { Sql } from "../db";
import { lockFinancialExecution } from "../finance/execution.server";
import { capabilities, type Capability, type Sport } from "./contracts";
export class CoordinatorDenied extends Error {
  constructor() {
    super("This action is not authorized for your coordinator access.");
  }
}
export type Grant = {
  user_id: string;
  sport: Sport;
  role: string;
  status: string;
  coverage: "sport" | "teams";
  team_ids: string[];
  permissions: Capability[];
  revision: number;
  independent_roles: string[];
};
export async function verifiedAccount(sql: Sql, userId: string, lock = false) {
  const [user] = await sql.query<{ id: string; email: string; name: string }>(
    `select id,lower(trim(email)) as email,name from "user" where id=$1 and "emailVerified"=true and "disabledAt" is null${lock ? " for share" : ""}`,
    [userId],
  );
  if (!user) throw new CoordinatorDenied();
  return user;
}
export async function authority(sql: Sql, userId: string, capability: string) {
  const user = await verifiedAccount(sql, userId, true);
  const [row] =
    await sql`select g.email from owner_grants g join staff_authorities a on a.email=g.email where g.user_id=${userId} and g.email=${user.email} and g.revoked_at is null and a.capability=${capability} for share of g,a`;
  if (!row) throw new CoordinatorDenied();
  return user;
}
export async function grants(sql: Sql, userId: string, lock = false) {
  await verifiedAccount(sql, userId, lock);
  return sql.query<Grant>(
    `select user_id,sport,role,status,coverage,team_ids,permissions,revision,independent_roles from coordinator_assignments where user_id=$1 order by sport${lock ? " for share" : ""}`,
    [userId],
  );
}
export function permits(rows: Grant[], permission: Capability, sport: Sport, teamId = "") {
  if (!Object.hasOwn(capabilities, permission)) return false;
  return rows.some(
    (g) =>
      g.status === "active" &&
      g.sport === sport &&
      g.permissions.includes(permission) &&
      (g.coverage === "sport" || Boolean(teamId && g.team_ids.includes(teamId))),
  );
}
export async function requireGrant(
  sql: Sql,
  userId: string,
  permission: Capability,
  sport: Sport,
  teamId = "",
) {
  const rows = await grants(sql, userId, true);
  if (!permits(rows, permission, sport, teamId)) throw new CoordinatorDenied();
  return rows;
}
export async function teamScope(sql: Sql, teamId: string) {
  const [team] = await sql<{
    id: string;
    sport: Sport;
    name: string;
  }>`select t->>'id' as id,t->>'sport' as sport,t->>'name' as name from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=${teamId} and coalesce(t->>'closed','false')<>'true' and t->>'sport' in ('baseball','softball') for share of c`;
  if (!team) throw new CoordinatorDenied();
  return team;
}
export async function requireTeam(
  sql: Sql,
  userId: string,
  permission: Capability,
  teamId: string,
) {
  const team = await teamScope(sql, teamId);
  await requireGrant(sql, userId, permission, team.sport, team.id);
  return team;
}
export async function checkScope(
  sql: Sql,
  userId: string,
  permission: Capability,
  sport: Sport,
  teamId: string,
) {
  if (teamId && (await teamScope(sql, teamId)).sport !== sport) throw new CoordinatorDenied();
  return requireGrant(sql, userId, permission, sport, teamId);
}
export async function audit(
  sql: Sql,
  userId: string,
  action: string,
  targetId: string,
  result: "allowed" | "denied" | "conflict",
  details: Record<string, unknown> = {},
  sport?: Sport,
  teamId?: string,
) {
  await sql`insert into coordinator_audit(actor_id,action,target_id,result,details,correlation_id,sport,team_id) values(${userId},${action},${targetId},${result},${JSON.stringify(details)}::jsonb,${randomUUID()},${sport || null},${teamId || null})`;
}
/** Grants are read and locked in the SAME transaction as data access. Revocation waits for in-flight work; the next request sees it. */
export async function secured<T>(
  sql: Sql,
  userId: string,
  action: string,
  work: (tx: Sql) => Promise<T>,
  beforeLocks?: typeof lockFinancialExecution,
) {
  try {
    return await sql.transaction(async (tx) => {
      // Internal lock-order hook only. Request data cannot supply code, and no
      // arbitrary callback may inspect domain data before account authorization.
      if (beforeLocks) {
        if (beforeLocks !== lockFinancialExecution) throw new Error("Invalid execution gate.");
        await beforeLocks(tx);
      }
      await verifiedAccount(tx, userId, true);
      await tx.query("select set_config('app.actor_id',$1,true)", [userId]);
      return work(tx);
    });
  } catch (error) {
    const denied = error instanceof CoordinatorDenied;
    await audit(sql, userId, action, "", denied ? "denied" : "conflict", {
      code: denied ? "ACCESS_DENIED" : "OPERATION_REJECTED",
    });
    if ((error as { code?: string }).code === "23505")
      throw new Error("This record or time is already reserved. Refresh or request owner review.");
    throw error;
  }
}

export async function recordRejectedCoordinatorRequest(sql: Sql, userId: string) {
  const [assigned] =
    await sql`select user_id from coordinator_assignments where user_id=${userId} and status<>'removed' limit 1`;
  if (assigned) await audit(sql, userId, "protected.request-rejected", "", "denied");
}

/** Financial isolation is sticky even when operational access is suspended/revoked.
 * Removing operations must never accidentally re-enable household billing. */
export async function financiallyRestricted(sql: Sql, userId: string) {
  const [row] = await sql<{
    financial_restricted: boolean;
  }>`select financial_restricted from organization_operational_access where user_id=${userId}`;
  return row?.financial_restricted === true;
}
export async function requireUnrestrictedLegacyAccess(sql: Sql, userId: string) {
  if (await financiallyRestricted(sql, userId)) throw new CoordinatorDenied();
}
export async function hasOrganizationOperations(sql: Sql, userId: string) {
  await verifiedAccount(sql, userId, true);
  const [row] =
    await sql`select user_id from organization_operational_access where user_id=${userId} and status='active' and financial_restricted=true for share`;
  return Boolean(row);
}
export async function requireOrganizationOperations(sql: Sql, userId: string) {
  const user = await verifiedAccount(sql, userId, true);
  if (await hasOrganizationOperations(sql, userId)) return user;
  if (await financiallyRestricted(sql, userId)) throw new CoordinatorDenied();
  // Preserve the existing verified-owner first-login claim flow. Never invoke it
  // for restricted accounts, including suspended accounts.
  const claimed =
    await sql`update owner_grants set user_id=${userId} where email=${user.email} and user_id is null and revoked_at is null returning email`;
  if (claimed.length)
    await sql`insert into profiles(user_id,name,email,role,family_id) values(${userId},${user.name},${user.email},'admin',${"fam-" + userId}) on conflict(user_id) do update set role='admin'`;
  const [owner] =
    await sql`select g.email from owner_grants g join profiles p on p.user_id=g.user_id where g.user_id=${userId} and g.email=${user.email} and g.revoked_at is null and p.role='admin' for share of g,p`;
  if (!owner) throw new CoordinatorDenied();
  return user;
}
