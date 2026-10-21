import type { z } from "zod";
import type { Sql } from "../db";
import { authority, audit, secured, CoordinatorDenied, type Grant } from "./access.server";
import { accessReviewInput, reviewPolicyInput, defaultReviewPolicy } from "./review-contracts";

/** Internal policy projection; callers must authorize before reading or writing. */
export async function reviewPolicyInTransaction(tx: Sql) {
  const [row] = await tx<{
    id: number;
    details: unknown;
  }>`select id::int,details from coordinator_audit where action='staff.review-policy' and target_id='coordinator-policy' and result='allowed' order by id desc limit 1`;
  return row ? { ...reviewPolicyInput.parse(row.details), revision: row.id } : defaultReviewPolicy;
}
export async function saveCoordinatorReviewPolicy(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof reviewPolicyInput>,
) {
  const input = reviewPolicyInput.parse(raw);
  return secured(sql, actor, "staff.review-policy", async (tx) => {
    await authority(tx, actor, "staff_roles.manage");
    await tx`select pg_advisory_xact_lock(hashtext('coordinator-review-policy'))`;
    const old = await reviewPolicyInTransaction(tx);
    if (old.revision !== input.revision)
      throw new Error("Review settings changed. Refresh before saving.");
    await audit(tx, actor, "staff.review-policy", "coordinator-policy", "allowed", input);
    return { ok: true };
  });
}
/** Reviews attest to an exact saved assignment; they never mutate or renew permissions. */
export async function reviewCoordinatorAccess(
  sql: Sql,
  actor: string,
  raw: z.infer<typeof accessReviewInput>,
) {
  const input = accessReviewInput.parse(raw);
  return secured(sql, actor, "staff.access-review", async (tx) => {
    await authority(tx, actor, "staff_roles.manage");
    if (actor === input.userId) throw new CoordinatorDenied();
    const [grant] =
      await tx<Grant>`select user_id,sport,role,status,coverage,team_ids,permissions,revision,independent_roles from coordinator_assignments where user_id=${input.userId} and sport=${input.sport} for share`;
    if (!grant || grant.status === "removed" || grant.revision !== input.revision)
      throw new Error("Access changed. Refresh and review the current assignment.");
    await audit(
      tx,
      actor,
      "staff.access-review",
      input.userId,
      "allowed",
      {
        period: input.period,
        reason: input.reason,
        revision: grant.revision,
        snapshot: grant,
      },
      input.sport,
    );
    return { ok: true };
  });
}
export async function coordinatorAccessReviews(sql: Sql, actor: string) {
  return secured(sql, actor, "staff.access-reviews.read", async (tx) => {
    await authority(tx, actor, "staff_roles.manage");
    const policy = await reviewPolicyInTransaction(tx);
    const assignments = await tx<
      Grant & {
        name: string;
        period: "weekly" | "monthly" | "quarterly";
        lastReviewedAt: Date | null;
        reviewerId: string | null;
        reviewedRevision: number | null;
        due: boolean;
      }
    >`select g.user_id,g.sport,g.role,g.status,g.coverage,g.team_ids,g.permissions,g.revision,g.independent_roles,u.name,p.period,r.created_at as "lastReviewedAt",r.actor_id as "reviewerId",(r.details->>'revision')::int as "reviewedRevision",(r.id is null or r.details->>'revision'<>g.revision::text or r.created_at<=now()-p.days*interval '1 day') as due from coordinator_assignments g join "user" u on u.id=g.user_id cross join (values ('weekly',${policy.weeklyDays}::int),('monthly',${policy.monthlyDays}::int),('quarterly',${policy.quarterlyDays}::int)) p(period,days) left join lateral (select a.id,a.actor_id,a.created_at,a.details from coordinator_audit a where a.action='staff.access-review' and a.result='allowed' and a.target_id=g.user_id and a.sport=g.sport and a.details->>'period'=p.period order by a.id desc limit 1) r on true where g.status<>'removed' order by u.name,g.user_id,g.sport,p.days`;
    const history = await tx<{
      id: number;
      actor_id: string;
      target_id: string;
      sport: string;
      created_at: Date;
      details: { period: string; reason: string; revision: number; snapshot: Grant };
    }>`select id,actor_id,target_id,sport,created_at,details from coordinator_audit where action='staff.access-review' and result='allowed' order by id desc limit 200`;
    return { assignments, history, policy };
  });
}
