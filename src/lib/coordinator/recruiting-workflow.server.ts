import type { z } from "zod";
import type { Sql } from "../db";
import {
  secured,
  checkScope,
  grants,
  permits,
  audit,
  CoordinatorDenied,
  financiallyRestricted,
} from "./access.server";
import { requestFor } from "./operations.server";
import { followupInput, attendanceInput } from "./recruiting-workflow-contracts";
import type { Sport } from "./contracts";
async function eligibleAssignee(tx: Sql, userId: string, sport: Sport, teamId: string) {
  const [u] =
    await tx`select id from "user" where id=${userId} and "emailVerified"=true and "disabledAt" is null for share`;
  if (!u) return false;
  if (permits(await grants(tx, userId, true), "recruiting.read", sport, teamId)) return true;
  if (await financiallyRestricted(tx, userId)) return false;
  const [owner] =
    await tx`select g.email from owner_grants g join staff_authorities a on a.email=g.email join "user" u on u.id=g.user_id where g.user_id=${userId} and g.email=lower(trim(u.email)) and g.revoked_at is null and a.capability='staff_roles.manage' for share of g,a`;
  return Boolean(owner);
}
export async function followupWorkspace(sql: Sql, userId: string, requestId: string) {
  return secured(sql, userId, "recruiting.followups.read", async (tx) => {
    const r = await requestFor(tx, userId, requestId, "recruiting.followups");
    const candidates = await tx<{
      id: string;
      name: string;
    }>`select distinct u.id,u.name from "user" u where u."emailVerified"=true and u."disabledAt" is null and (exists(select 1 from coordinator_assignments g where g.user_id=u.id and g.status='active' and g.sport=${r.sport} and 'recruiting.read'=any(g.permissions) and (g.coverage='sport' or ${r.team_id}=any(g.team_ids))) or exists(select 1 from owner_grants g join staff_authorities a on a.email=g.email where g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null and a.capability='staff_roles.manage')) order by u.name,u.id`;
    const assignees = [];
    for (const c of candidates)
      if (await eligibleAssignee(tx, c.id, r.sport, r.team_id)) assignees.push(c);
    const [work] = await tx<{
      revision: number;
      assigneeId: string;
      dueDate: string;
    }>`select revision,coalesce(assignee_id,'') as "assigneeId",coalesce(to_char(follow_up_date,'YYYY-MM-DD'),'') as "dueDate" from office_request_work where request_id=${requestId}`;
    return {
      revision: work?.revision || 0,
      assigneeId: assignees.some((a) => a.id === work?.assigneeId) ? work!.assigneeId : "",
      dueDate: work?.dueDate || "",
      assignees,
    };
  });
}
export async function saveFollowup(sql: Sql, userId: string, raw: z.infer<typeof followupInput>) {
  const v = followupInput.parse(raw);
  return secured(sql, userId, "recruiting.followups", async (tx) => {
    const r = await requestFor(tx, userId, v.requestId, "recruiting.followups");
    if (v.assigneeId && !(await eligibleAssignee(tx, v.assigneeId, r.sport, r.team_id)))
      throw new CoordinatorDenied();
    if (v.dueDate && !v.assigneeId)
      throw Error("Choose an authorized assignee for a dated follow-up.");
    const [old] = await tx<{
      revision: number;
      assignee_id: string | null;
      dueDate: string;
    }>`select revision,assignee_id,to_char(follow_up_date,'YYYY-MM-DD') as "dueDate" from office_request_work where request_id=${v.requestId} for update`;
    if ((old?.revision || 0) !== v.revision)
      throw Error("Follow-up changed. Reload before saving.");
    await tx`insert into office_request_work(request_id,assignee_id,follow_up_date) values(${v.requestId},${v.assigneeId || null},${v.dueDate || null}::date) on conflict(request_id) do update set assignee_id=excluded.assignee_id,follow_up_date=excluded.follow_up_date,revision=office_request_work.revision+1,updated_at=now()`;
    await audit(
      tx,
      userId,
      "recruiting.followups",
      v.requestId,
      "allowed",
      {
        before: { assigneeId: old?.assignee_id || "", dueDate: old?.dueDate || "" },
        after: { assigneeId: v.assigneeId, dueDate: v.dueDate },
      },
      r.sport,
      r.team_id,
    );
    return { ok: true };
  });
}
export async function saveTryoutAttendance(
  sql: Sql,
  userId: string,
  raw: z.infer<typeof attendanceInput>,
) {
  const v = attendanceInput.parse(raw);
  return secured(sql, userId, "tryouts.attendance", async (tx) => {
    const r = await requestFor(tx, userId, v.requestId, "tryouts.attendance");
    if (r.kind !== "tryout") throw new CoordinatorDenied();
    const [old] = await tx<{
      revision: number;
      follow_up: string;
    }>`select revision,follow_up from office_request_work where request_id=${v.requestId} for update`;
    if ((old?.revision || 0) !== v.revision)
      throw Error("Attendance changed. Reload before saving.");
    if (old && ["accepted", "closed"].includes(old.follow_up))
      throw Error(
        "This registration is closed. Ask an owner to reopen it before changing attendance.",
      );
    await tx`insert into office_request_work(request_id,follow_up) values(${v.requestId},${v.status}) on conflict(request_id) do update set follow_up=excluded.follow_up,revision=office_request_work.revision+1,updated_at=now()`;
    await audit(
      tx,
      userId,
      "tryouts.attendance",
      v.requestId,
      "allowed",
      { before: old?.follow_up || "new", after: v.status },
      r.sport,
      r.team_id,
    );
    return { ok: true };
  });
}
export async function recruitingDelivery(sql: Sql, userId: string, requestId: string) {
  return secured(sql, userId, "communications.delivery.read", async (tx) => {
    const r = await requestFor(tx, userId, requestId, "communications.delivery.read");
    await checkScope(tx, userId, "recruiting.read", r.sport, r.team_id);
    // No addresses, bodies, provider payloads, or another sender's correspondence.
    const rows = await tx<{
      id: string;
      status: string;
      attempts: number;
      created_at: Date;
      accepted_at: Date | null;
    }>`select id,status,attempts,created_at,accepted_at from tryout_center_notices where request_id=${requestId} and coordinator_actor_id=${userId} order by created_at desc,id desc limit 100`;
    await audit(
      tx,
      userId,
      "communications.delivery.read",
      requestId,
      "allowed",
      { count: rows.length },
      r.sport,
      r.team_id,
    );
    return rows;
  });
}
