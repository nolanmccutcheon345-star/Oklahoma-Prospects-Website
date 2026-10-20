import type { Sql } from "../db";
import { authority, secured } from "./access.server";
import { reviewPolicyInTransaction } from "./reviews.server";
type Finding = { code: string; count: number; priority: "critical" | "review" };
type Summary = {
  actions: { action: string; sport: string | null; result: string; count: number }[];
  activeAssignments: number;
  zeroPermissionAssignments: number;
  pendingApprovals: number;
  overdueAccessReviews: number;
};
type Run = {
  id: string;
  cadence: string;
  period_start: Date;
  period_end: Date;
  findings: Finding[];
  summary: Summary;
  created_at: Date;
};

/** Internal scheduler only. The authenticated production worker invokes this;
 * there is no client transport accepting a timestamp or bypassing owner access. */
export async function runScheduledCoordinatorReviews(sql: Sql, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw Error("Invalid review time.");
  return sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('coordinator-scheduled-reviews'))`;
    const [clock] = await tx<{
      hour: number;
    }>`select extract(hour from ${now.toISOString()}::timestamptz at time zone 'America/Chicago')::int as hour`;
    if (clock.hour < 8) return { created: 0 };
    const policy = await reviewPolicyInTransaction(tx);
    const recipients = await tx<{
      email: string;
    }>`select g.email from owner_grants g join "user" u on u.id=g.user_id join staff_authorities a on a.email=g.email where g.revoked_at is null and g.email=lower(trim(u.email)) and u."emailVerified"=true and u."disabledAt" is null and a.capability='staff_activity.read' order by g.email`;
    // Do not consume a report period without an authorized reviewer to notify.
    if (!recipients.length) return { created: 0 };
    let created = 0;
    for (const [cadence, unit] of [
      ["daily", "day"],
      ["weekly", "week"],
      ["monthly", "month"],
      ["quarterly", "quarter"],
    ] as const) {
      const [period] = await tx<{
        key: string;
        start: Date;
        end: Date;
      }>`select to_char(date_trunc(${unit},${now.toISOString()}::timestamptz at time zone 'America/Chicago'),'YYYY-MM-DD') as key,(date_trunc(${unit},${now.toISOString()}::timestamptz at time zone 'America/Chicago')-case ${unit} when 'day' then interval '1 day' when 'week' then interval '1 week' when 'month' then interval '1 month' else interval '3 months' end) at time zone 'America/Chicago' as start,date_trunc(${unit},${now.toISOString()}::timestamptz at time zone 'America/Chicago') at time zone 'America/Chicago' as end`;
      const id = `${cadence}:${period.key}`;
      if ((await tx`select id from coordinator_review_runs where id=${id}`).length) continue;
      const findings: Finding[] = [];
      const [integrity] = await tx<{
        disabled: number;
        invalidTeams: number;
        retired: number;
        missingAuditProtection: number;
        denials: number;
      }>`select
        (select count(*)::int from coordinator_assignments g join "user" u on u.id=g.user_id where g.status='active' and cardinality(g.permissions)>0 and (u."disabledAt" is not null or not u."emailVerified")) as disabled,
        (select count(*)::int from coordinator_assignments g cross join lateral unnest(g.team_ids) team_id where g.status='active' and not exists(select 1 from club_state c cross join lateral jsonb_array_elements(c.payload->'teams') t where c.id='oklahoma-prospects' and not c.demo and t->>'id'=team_id and t->>'sport'=g.sport and coalesce(t->>'closed','false')<>'true')) as "invalidTeams",
        (select count(*)::int from organization_operational_access where status='active') as retired,
        (select count(*)::int from (values ('immutable_audit'),('immutable_coordinator_audit_truncate'),('coordinator_audit_mirror')) required(name) where not exists(select 1 from pg_trigger p where p.tgrelid='coordinator_audit'::regclass and p.tgname=required.name and p.tgenabled in ('O','A'))) as "missingAuditProtection",
        (select count(*)::int from (select actor_id from coordinator_audit where result='denied' and created_at>${now.toISOString()}::timestamptz-${policy.denialWindowHours}*interval '1 hour' and created_at<=${now.toISOString()}::timestamptz group by actor_id having count(*)>=${policy.denialThreshold}) repeated) as denials`;
      const codes = [
        ["disabled", "inactive-account-retained-grants", "review"],
        ["invalidTeams", "invalid-team-scope", "review"],
        ["retired", "retired-blanket-grant-present", "review"],
        ["missingAuditProtection", "audit-protection-missing", "critical"],
        ["denials", "repeated-denied-access", "review"],
      ] as const;
      for (const [field, code, priority] of codes)
        if (integrity[field]) findings.push({ code, count: integrity[field], priority });
      const actions = await tx<
        Summary["actions"][number]
      >`select action,sport,result,count(*)::int as count from coordinator_audit where created_at>=${period.start} and created_at<${period.end} group by action,sport,result order by action,sport,result`;
      const days =
        cadence === "weekly"
          ? policy.weeklyDays
          : cadence === "monthly"
            ? policy.monthlyDays
            : policy.quarterlyDays;
      const [counts] = await tx<Omit<Summary, "actions">>`select
        (select count(*)::int from coordinator_assignments where status='active') as "activeAssignments",
        (select count(*)::int from coordinator_assignments where status='active' and cardinality(permissions)=0) as "zeroPermissionAssignments",
        (select count(*)::int from coordinator_approvals where status='pending') as "pendingApprovals",
        (select count(*)::int from coordinator_assignments g where g.status<>'removed' and not exists(select 1 from coordinator_audit a where a.action='staff.access-review' and a.result='allowed' and a.target_id=g.user_id and a.sport=g.sport and a.details->>'revision'=g.revision::text and a.details->>'period'=${cadence === "daily" ? "quarterly" : cadence} and a.created_at>${now.toISOString()}::timestamptz-${days}*interval '1 day')) as "overdueAccessReviews"`;
      const summary = { ...counts, actions };
      await tx`insert into coordinator_review_runs(id,cadence,period_start,period_end,findings,summary) values(${id},${cadence},${period.start},${period.end},${JSON.stringify(findings)}::jsonb,${JSON.stringify(summary)}::jsonb)`;
      const body = `Coordinator ${cadence} review — ${period.key}\n\n${findings.length ? findings.map((f) => `${f.priority}: ${f.code} (${f.count})`).join("\n") : "No findings in the automated checks performed."}\n\nActive assignments: ${counts.activeAssignments}\nZero-permission assignments: ${counts.zeroPermissionAssignments}\nPending approvals: ${counts.pendingApprovals}\nAccess reviews due: ${counts.overdueAccessReviews}\nRecorded actions in the completed period: ${actions.reduce((n, a) => n + a.count, 0)}\n\nThese checks do not certify absence of every security issue. Review details and current permissions: https://prospectssports.club/office`;
      for (const r of recipients)
        await tx`insert into site_alert_deliveries(id,recipient,audience,subject,body) values(${`coordinator-review:${id}:${r.email}`},${r.email},'coordinator-owners',${`Prospects — coordinator ${cadence} review`},${body}) on conflict do nothing`;
      created++;
    }
    return { created };
  });
}
export async function scheduledCoordinatorReviews(sql: Sql, userId: string) {
  return secured(sql, userId, "staff.scheduled-reviews.read", async (tx) => {
    await authority(tx, userId, "staff_activity.read");
    return tx<Run>`select id,cadence,period_start,period_end,findings,summary,created_at from coordinator_review_runs order by created_at desc,id limit 100`;
  });
}
