import type { Sql } from "../db";
import { reviewPolicyInTransaction } from "./reviews.server";
type Finding = {
  code: string;
  priority: "critical" | "review";
  actor_id: string;
  observed_count: number;
  window_hours: number;
};
/** Internal worker only. Risk indicators request human review and do not change permissions. */
export async function runCoordinatorRiskChecks(sql: Sql, now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw Error("Invalid risk check time");
  return sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('coordinator-risk-checks'))`;
    const policy = await reviewPolicyInTransaction(tx);
    const recipients = await tx<{
      email: string;
    }>`select g.email from owner_grants g join "user" u on u.id=g.user_id join staff_authorities a on a.email=g.email where a.capability='staff_activity.read' and g.revoked_at is null and g.email=lower(trim(u.email)) and u."emailVerified" and u."disabledAt" is null`;
    if (!recipients.length) return { created: 0 };
    const findings: Finding[] = [];
    const rows = await tx<{
      actor_id: string;
      roster: number;
      contacts: number;
      publication: number;
      protected: number;
      privilege: number;
    }>`select actor_id,
   count(*) filter(where result='allowed' and (action like 'rosters.%' or action='organization.player.save'))::int as roster,
   coalesce(sum(case when action='contacts.read' and result='allowed' and jsonb_typeof(details->'count')='number' then least(greatest((details->>'count')::numeric,0),1000000) else 0 end),0)::int as contacts,
   count(*) filter(where result='denied' and (action like 'content.%' or action like '%.publish%' or action='tryouts.schedule.request'))::int as publication,
   count(*) filter(where result<>'allowed' and (action like 'cages.%' or action like 'events.%' or action like 'tryouts.schedule.%'))::int as protected,
   count(*) filter(where result='denied' and (action like 'staff%' or action='protected.request-rejected'))::int as privilege
   from coordinator_audit where created_at>${now.toISOString()}::timestamptz-${policy.riskWindowHours}*interval '1 hour' and created_at<=${now.toISOString()}::timestamptz group by actor_id`;
    for (const r of rows) {
      if (r.roster >= policy.rosterChangeThreshold)
        findings.push({
          code: "unusual-roster-change-volume",
          priority: "review",
          actor_id: r.actor_id,
          observed_count: r.roster,
          window_hours: policy.riskWindowHours,
        });
      if (r.contacts >= policy.contactReadThreshold)
        findings.push({
          code: "unusual-contact-read-volume",
          priority: "review",
          actor_id: r.actor_id,
          observed_count: r.contacts,
          window_hours: policy.riskWindowHours,
        });
      if (r.publication)
        findings.push({
          code: "publication-access-rejected",
          priority: "review",
          actor_id: r.actor_id,
          observed_count: r.publication,
          window_hours: policy.riskWindowHours,
        });
      if (r.protected >= policy.denialThreshold)
        findings.push({
          code: "repeated-schedule-change-rejections",
          priority: "review",
          actor_id: r.actor_id,
          observed_count: r.protected,
          window_hours: policy.riskWindowHours,
        });
      if (r.privilege)
        findings.push({
          code: "restricted-administration-attempt",
          priority: "critical",
          actor_id: r.actor_id,
          observed_count: r.privilege,
          window_hours: policy.riskWindowHours,
        });
    }
    const [integrity] = await tx<{ missing: number; unowned: number }>`select
   (select count(*)::int from (values('immutable_audit'),('immutable_coordinator_audit_truncate'),('coordinator_audit_mirror'),('coordinator_audit_roles')) required(name) where not exists(select 1 from pg_trigger p where p.tgrelid='coordinator_audit'::regclass and p.tgname=required.name and p.tgenabled in ('O','A'))) as missing,
   (select count(*)::int from coordinator_audit where action like 'staff.%' and result='allowed' and created_at>${now.toISOString()}::timestamptz-${policy.riskWindowHours}*interval '1 hour' and created_at<=${now.toISOString()}::timestamptz and actor_roles<>'[]'::jsonb and not actor_roles @> '[{"role":"verified_owner"}]'::jsonb) as unowned`;
    if (integrity.missing)
      findings.push({
        code: "audit-protection-missing",
        priority: "critical",
        actor_id: "",
        observed_count: integrity.missing,
        window_hours: policy.riskWindowHours,
      });
    if (integrity.unowned)
      findings.push({
        code: "unexpected-successful-administration",
        priority: "critical",
        actor_id: "",
        observed_count: integrity.unowned,
        window_hours: policy.riskWindowHours,
      });
    const [clock] = await tx<{
      day: string;
    }>`select to_char(${now.toISOString()}::timestamptz at time zone 'America/Chicago','YYYY-MM-DD') as day`;
    let created = 0;
    for (const f of findings) {
      const id = `${clock.day}:${f.code}:${f.actor_id}`;
      const added =
        await tx`insert into coordinator_risk_alerts(id,code,priority,actor_id,observed_count,window_hours) values(${id},${f.code},${f.priority},${f.actor_id},${f.observed_count},${f.window_hours}) on conflict do nothing returning id`;
      if (!added.length) continue;
      for (const r of recipients)
        await tx`insert into site_alert_deliveries(id,recipient,audience,subject,body) values(${"coordinator-risk:" + id + ":" + r.email},${r.email},'coordinator-owners',${"Prospects — " + f.priority + " staff activity review"},${`Indicator: ${f.code}\nObserved count: ${f.observed_count} in ${f.window_hours} hours.\nThis is a review indicator, not a confirmed disclosure or wrongdoing. Open Staff Activity to examine current grants, scope and related actions.\nhttps://prospectssports.club/office`}) on conflict do nothing`;
      created++;
    }
    return { created };
  });
}
