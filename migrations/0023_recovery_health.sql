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
