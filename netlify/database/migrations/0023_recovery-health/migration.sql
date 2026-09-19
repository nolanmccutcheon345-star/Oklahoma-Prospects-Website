-- Generated from migrations/0023_recovery_health.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0023_recovery_health.sql') THEN
-- Operational health only: no payment, booking, or recipient changes.
create table recovery_job_health (
 environment text not null check(environment in ('production','sandbox')),
 name text not null,
 run_id text not null,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 last_success_at timestamptz,
 status text not null default 'running',
 summary jsonb not null default '{}',
 primary key(environment,name)
);
alter table recovery_job_health enable row level security;
revoke all on recovery_job_health from public;

    INSERT INTO _migrations (name) VALUES ('0023_recovery_health.sql');
  END IF;
END
$netlify_apply$;
