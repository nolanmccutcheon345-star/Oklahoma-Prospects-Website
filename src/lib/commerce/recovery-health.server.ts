import { randomUUID } from "node:crypto";
import type { Sql } from "../db";

type Summary = { failures: number; [key: string]: number };
/** Durable heartbeat. A killed or timed-out run stays visibly running/stale. */
export async function recordRecoveryRun(
  sql: Sql,
  environment: string,
  name: string,
  work: () => Promise<Summary>,
) {
  const run = randomUUID();
  await sql`insert into recovery_job_health(environment,name,run_id) values(${environment},${name},${run})
    on conflict(environment,name) do update set run_id=excluded.run_id,started_at=now(),finished_at=null,status='running',summary='{}'`;
  try {
    const summary = await work();
    await sql`update recovery_job_health set finished_at=now(),status=${summary.failures ? "attention" : "completed"},summary=${JSON.stringify(summary)}::jsonb,
      last_success_at=case when ${summary.failures}=0 then now() else last_success_at end
      where environment=${environment} and name=${name} and run_id=${run}`;
    console.info("Recovery job completed", { name, environment, ...summary });
    return summary;
  } catch (error) {
    await sql`update recovery_job_health set finished_at=now(),status='failed',summary='{"failures":1}'
      where environment=${environment} and name=${name} and run_id=${run}`;
    console.error("Recovery job failed", { name, environment });
    throw error;
  }
}

export async function recoveryHealth(sql: Sql, environment: string) {
  const [jobs, queues, attempts] = await Promise.all([
    sql<{
      name: string;
      status: string;
      started_at: Date;
      finished_at: Date | null;
      last_success_at: Date | null;
      summary: Summary;
    }>`select name,status,started_at,finished_at,last_success_at,summary from recovery_job_health where environment=${environment} order by name`,
    sql<{ kind: string; pending: number; review: number; oldest: Date | null }>`
      select 'Payment attempts' as kind,count(*)::int as pending, count(*) filter(where a.created_at<now()-interval '1 day')::int as review,min(a.created_at) as oldest
        from square_payment_attempts a join commerce_orders o on o.id=a.order_id where a.status in ('pending','unknown') and o.payment_environment=${environment}
      union all select 'Refunds',count(*)::int,0,min(r.created_at) from commerce_refunds r join square_payments p on p.id=r.square_payment_id where r.status in ('pending','unknown') and p.environment=${environment}
      union all select 'Square events',count(*)::int,0,min(received_at) from square_events where status='pending' and environment=${environment}
      union all select 'Payment emails',count(*) filter(where n.status='pending')::int,count(*) filter(where n.status='review')::int,min(n.created_at) from payment_notifications n join commerce_orders o on o.id=n.order_id where n.status in ('pending','review') and o.payment_environment=${environment}
      union all select 'Activity events',count(*)::int,0,min(a.created_at) from site_alert_events q join audit_events a on a.id=q.id where q.batched_at is null and ${environment}='production'
      union all select 'Staff and owner emails',count(*) filter(where status='pending')::int,count(*) filter(where status='review')::int,min(created_at) from site_alert_deliveries where status in ('pending','review') and ${environment}='production'`,
    sql<{
      id: string;
      order_id: string;
      status: string;
      created_at: Date;
    }>`select a.id,a.order_id,a.status,a.created_at from square_payment_attempts a join commerce_orders o on o.id=a.order_id where a.status in ('pending','unknown') and o.payment_environment=${environment} order by a.created_at limit 30`,
  ]);
  return { jobs, queues, attempts, checkedAt: new Date().toISOString() };
}
