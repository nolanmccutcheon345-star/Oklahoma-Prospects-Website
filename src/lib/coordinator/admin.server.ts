import { reviewPolicyInTransaction } from "./reviews.server";
import type { Sql } from "../db";
import { assignmentInput, publicLeadershipInput, type AssignmentInput } from "./contracts";
import { audit, authority, secured, teamScope, CoordinatorDenied } from "./access.server";
export async function staffWorkspace(sql: Sql, userId: string) {
  return secured(sql, userId, "staff.list", async (tx) => {
    await authority(tx, userId, "staff_roles.manage");
    const accounts = await tx<{
      id: string;
      name: string;
      email: string;
      role: string;
      instructor: boolean;
      legacy_reader: boolean;
    }>`select u.id,u.name,u.email,coalesce(p.role,'parent') as role,coalesce(pp.instructor,false) as instructor,coalesce(r.active,false) as legacy_reader from "user" u left join profiles p on p.user_id=u.id left join person_profiles pp on pp.user_id=u.id left join registration_readers r on r.user_id=u.id where u."disabledAt" is null and u."emailVerified"=true order by u.name`;
    const assignments = await tx<
      import("./access.server").Grant
    >`select user_id,sport,role,status,coverage,team_ids,permissions,revision,independent_roles from coordinator_assignments order by user_id,sport`;
    const teams = await tx<{
      id: string;
      name: string;
      sport: string;
    }>`select t->>'id' as id,t->>'name' as name,t->>'sport' as sport from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'closed','false')<>'true'`;
    const leadership = await tx<{
      user_id: string;
      enabled: boolean;
      titles: ("Baseball Coordinator" | "Softball Coordinator")[];
      display_order: number;
      revision: number;
    }>`select user_id,enabled,titles,display_order,revision from public_leadership`;
    const retiredAccess = await tx<{
      user_id: string;
      revision: number;
      status: string;
    }>`select user_id,revision,status from organization_operational_access order by user_id`;
    return { accounts, assignments, teams, leadership, retiredAccess };
  });
}
export async function saveAssignment(sql: Sql, actor: string, raw: AssignmentInput) {
  const input = assignmentInput.parse(raw);
  return secured(sql, actor, "staff_roles.manage", async (tx) => {
    return saveAssignmentInTransaction(tx, actor, input);
  });
}
/** Internal transaction helper; every caller passes the same authority and scope checks. */
export async function saveAssignmentInTransaction(tx: Sql, actor: string, raw: AssignmentInput) {
  const input = assignmentInput.parse(raw);
  await authority(tx, actor, "staff_roles.manage");
  if (actor === input.userId) throw new CoordinatorDenied();
  const [target] = await tx<{
    email: string;
    role: string;
    instructor: boolean;
  }>`select lower(trim(u.email)) as email,coalesce(p.role,'parent') as role,coalesce(pp.instructor,false) as instructor from "user" u left join profiles p on p.user_id=u.id left join person_profiles pp on pp.user_id=u.id where u.id=${input.userId} and u."disabledAt" is null and u."emailVerified"=true for update of u`;
  if (!target || target.role === "player")
    throw new Error("Choose an active, verified adult staff account.");
  const [legacy] =
    await tx`select user_id from registration_readers where user_id=${input.userId} and active=true`;
  if (legacy && input.status === "active")
    throw new Error(
      "Disable this account’s broad legacy registration-reader access before assigning scoped coordinator access.",
    );
  const coaching =
    await tx`select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and (lower(trim(t->>'coachEmail'))=${target.email} or exists(select 1 from jsonb_array_elements(coalesce(t->'staff','[]'::jsonb)) m where lower(trim(m->>'email'))=${target.email})) limit 1`;
  const independent = [
    ...(target.role !== "parent" ? [target.role] : []),
    ...(target.instructor ? ["instructor"] : []),
    ...(coaching.length ? ["team-coach"] : []),
  ];
  if (independent.length && !input.independentRolesReviewed)
    throw new Error(
      "Review the separate roles before saving. Coordinator grants do not confer or remove those privileges.",
    );
  if (input.coverage === "sport" && input.teamIds.length)
    throw new Error("Sport-wide access must not contain team IDs.");
  for (const id of input.teamIds)
    if ((await teamScope(tx, id)).sport !== input.sport) throw new CoordinatorDenied();
  const [old] = await tx<{
    revision: number;
    permissions: string[];
    coverage: string;
    team_ids: string[];
    status: string;
  }>`select revision,permissions,coverage,team_ids,status from coordinator_assignments where user_id=${input.userId} and sport=${input.sport} for update`;
  if ((old?.revision || 0) !== input.revision)
    throw new Error("Permissions changed. Reload before saving.");
  // Assignment itself is identity only. The first save must have no grants.
  if (!old && input.permissions.length)
    throw new Error(
      "Assign the coordinator role with zero permissions first, then explicitly grant access.",
    );
  const permissions = input.status === "removed" ? [] : [...new Set(input.permissions)];
  await tx`insert into coordinator_assignments(user_id,sport,status,coverage,team_ids,permissions,independent_roles,updated_by) values(${input.userId},${input.sport},${input.status},${input.coverage},${[...new Set(input.teamIds)]},${permissions},${independent},${actor}) on conflict(user_id,sport) do update set status=excluded.status,coverage=excluded.coverage,team_ids=excluded.team_ids,permissions=excluded.permissions,independent_roles=excluded.independent_roles,revision=coordinator_assignments.revision+1,updated_by=excluded.updated_by,updated_at=now()`;
  await audit(
    tx,
    actor,
    "staff_roles.manage",
    input.userId,
    "allowed",
    {
      before: old || null,
      after: {
        permissions,
        status: input.status,
        coverage: input.coverage,
        team_ids: input.teamIds,
      },
      independentRoles: independent,
    },
    input.sport,
  );
  return { ok: true };
}
export async function saveLeadership(
  sql: Sql,
  actor: string,
  raw: import("zod").z.infer<typeof publicLeadershipInput>,
) {
  const input = publicLeadershipInput.parse(raw);
  return secured(sql, actor, "staff.public-title", async (tx) => {
    await authority(tx, actor, "staff_roles.manage");
    const [u] =
      await tx`select id from "user" where id=${input.userId} and "disabledAt" is null and "emailVerified"=true`;
    if (!u) throw new Error("Choose a verified staff account.");
    const [old] = await tx<{
      revision: number;
    }>`select revision from public_leadership where user_id=${input.userId} for update`;
    if ((old?.revision || 0) !== input.revision)
      throw new Error("Public profile settings changed. Reload.");
    await tx`insert into public_leadership(user_id,enabled,titles,display_order) values(${input.userId},${input.enabled},${input.titles},${input.order}) on conflict(user_id) do update set enabled=excluded.enabled,titles=excluded.titles,display_order=excluded.display_order,revision=public_leadership.revision+1`;
    await audit(tx, actor, "staff.public-title", input.userId, "allowed", {
      enabled: input.enabled,
      titles: input.titles,
    });
    return { ok: true };
  });
}
export async function activityWorkspace(
  sql: Sql,
  userId: string,
  filter: { actor?: string; sport?: string; teamId?: string; after?: string } = {},
) {
  return secured(sql, userId, "staff_activity.read", async (tx) => {
    await authority(tx, userId, "staff_activity.read");
    const events = await tx<{
      id: number;
      actor_id: string;
      action: string;
      sport: string;
      team_id: string;
      target_id: string;
      result: string;
      details: string;
      created_at: Date;
    }>`select id,actor_id,action,sport,team_id,target_id,result,details::text as details,created_at from coordinator_audit where (${filter.actor || ""}='' or actor_id=${filter.actor || ""}) and (${filter.sport || ""}='' or sport=${filter.sport || ""}) and (${filter.teamId || ""}='' or team_id=${filter.teamId || ""}) and created_at>=coalesce(${filter.after || null}::timestamptz,now()-interval '90 days') order by id desc limit 500`;
    const policy = await reviewPolicyInTransaction(tx);
    const alerts = await tx<{
      actor_id: string;
      denials: number;
    }>`select actor_id,count(*)::int as denials from coordinator_audit where result='denied' and created_at>now()-${policy.denialWindowHours}::int*interval '1 hour' group by actor_id having count(*)>=${policy.denialThreshold}`;
    return { events, alerts, denialWindowHours: policy.denialWindowHours };
  });
}
