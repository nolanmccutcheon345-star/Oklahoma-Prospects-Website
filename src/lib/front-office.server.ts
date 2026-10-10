import { getSql, type Sql } from "./db";
import { resolveIdentity } from "./identity.server";
import { clubIdentity } from "./identity.server";
import type { z } from "zod";
import type { requestWorkInput } from "./front-office-api";
export async function ownerDb(userId: string) {
  const me = await clubIdentity(userId);
  if (me.role !== "admin") throw new Error("Owner access required.");
  return getSql();
}
export async function frontOffice(userId: string) {
  return frontOfficeFor(await ownerDb(userId), userId);
}
export async function frontOfficeFor(sql: Sql, userId: string) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
  const [counts, schedule, payments] = await Promise.all([
    sql<{ schedule: number; requests: number; evaluations: number; payments: number }>`select
 (select count(*)::int from booking_records where status='confirmed' and (starts_at at time zone 'America/Chicago')::date=(now() at time zone 'America/Chicago')::date) as schedule,
 (select count(*)::int from club_requests r left join office_request_work w on w.request_id=r.id where r.status not in ('resolved','accepted') and coalesce(w.follow_up,'new')<>'closed') as requests,
 (select count(*)::int from tryout_evaluations e left join tryout_evaluation_reviews v on v.evaluation_id=e.id and v.revision=e.revision where e.status='submitted' and v.evaluation_id is null) as evaluations,
 (select count(*)::int from commerce_orders where status='payment_review') as payments`,
    sql<{
      id: string;
      product_id: string;
      starts_at: Date;
      ends_at: Date;
      status: string;
      email: string;
    }>`select b.id,b.product_id,b.starts_at,b.ends_at,b.status,coalesce(o.email,'') as email from booking_records b left join commerce_orders o on o.id=b.order_id where b.status='confirmed' and (b.starts_at at time zone 'America/Chicago')::date=(now() at time zone 'America/Chicago')::date order by b.starts_at`,
    sql<{
      id: string;
      email: string;
      total_cents: number;
      status: string;
    }>`select id,email,total_cents,status from commerce_orders where status='payment_review' order by created_at desc`,
  ]);
  return { counts: counts[0], schedule, payments };
}
export async function requestWork(userId: string) {
  const sql = await ownerDb(userId);
  const [work, notes, staff] = await Promise.all([
    sql<{
      request_id: string;
      assignee_id: string | null;
      follow_up: string;
      updated_at: Date;
    }>`select * from office_request_work`,
    sql<{
      id: string;
      request_id: string;
      note: string;
      name: string;
      created_at: Date;
    }>`select n.id,n.request_id,n.note,u.name,n.created_at from office_request_notes n join "user" u on u.id=n.actor_id order by n.created_at desc`,
    sql<{
      id: string;
      name: string;
    }>`select u.id,u.name from "user" u join profiles p on p.user_id=u.id where u."disabledAt" is null and p.role in ('admin','coach') order by u.name`,
  ]);
  return { work, notes, staff };
}
export async function saveWorkFor(
  sql: Sql,
  userId: string,
  input: z.infer<typeof requestWorkInput>,
) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
  return sql.transaction(async (tx) => {
    const [request] = await tx<{
      kind: string;
      status: string;
    }>`select kind,status from club_requests where id=${input.id} for update`;
    if (!request) throw new Error("Request not found.");
    if (
      input.status === "closed" &&
      ["membership-pause", "refund-review"].includes(request.kind) &&
      request.status === "open"
    )
      throw new Error("Resolve billing through Payments before closing this request.");
    if (input.assignee) {
      const [staff] =
        await tx`select u.id from "user" u join profiles p on p.user_id=u.id where u.id=${input.assignee} and u."disabledAt" is null and p.role in ('admin','coach')`;
      if (!staff) throw new Error("Choose an active staff account.");
    }
    await tx`insert into office_request_work(request_id,assignee_id,follow_up) values(${input.id},${input.assignee || null},${input.status}) on conflict(request_id) do update set assignee_id=excluded.assignee_id,follow_up=excluded.follow_up,updated_at=now()`;
    if (input.note)
      await tx`insert into office_request_notes(id,request_id,actor_id,note) values(${input.noteId},${input.id},${userId},${input.note}) on conflict(id) do nothing`;
    return { ok: true };
  });
}
export async function saveRequestWork(userId: string, input: z.infer<typeof requestWorkInput>) {
  return saveWorkFor(await ownerDb(userId), userId, input);
}
export async function evaluationReviews(userId: string) {
  const sql = await ownerDb(userId);
  return sql<{
    evaluation_id: string;
    revision: number;
    reviewed_at: Date;
  }>`select evaluation_id,revision,reviewed_at from tryout_evaluation_reviews`;
}
export async function markReviewedFor(
  sql: Sql,
  userId: string,
  input: { id: string; revision: number },
) {
  if ((await resolveIdentity(sql, userId)).role !== "admin")
    throw new Error("Owner access required.");
  return sql.transaction(async (tx) => {
    const [row] = await tx<{
      revision: number;
      status: string;
    }>`select revision,status from tryout_evaluations where id=${input.id} for update`;
    if (!row || row.status !== "submitted" || row.revision !== input.revision)
      throw new Error("This evaluation changed. Reload and review the latest submitted version.");
    await tx`insert into tryout_evaluation_reviews(evaluation_id,revision,reviewer_id) values(${input.id},${input.revision},${userId}) on conflict(evaluation_id) do update set revision=excluded.revision,reviewer_id=excluded.reviewer_id,reviewed_at=now()`;
    return { ok: true };
  });
}
export async function markReviewed(userId: string, input: { id: string; revision: number }) {
  return markReviewedFor(await ownerDb(userId), userId, input);
}
