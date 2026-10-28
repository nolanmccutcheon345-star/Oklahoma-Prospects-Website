-- Generated from migrations/0083_coordinator_review_runs.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0083_coordinator_review_runs.sql') THEN
-- Durable, append-only scheduled review receipts; no permissions or accounts change.
create table coordinator_review_runs (
 id text primary key,
 cadence text not null check(cadence in ('daily','weekly','monthly','quarterly')),
 period_start timestamptz not null,
 period_end timestamptz not null,
 findings jsonb not null,
 summary jsonb not null,
 created_at timestamptz not null default now(),
 check(period_start<period_end)
);
alter table coordinator_review_runs enable row level security;
revoke all on coordinator_review_runs from public;
create trigger immutable_review_run before update or delete on coordinator_review_runs for each row execute function protect_club_audit();
create trigger immutable_review_run_truncate before truncate on coordinator_review_runs for each statement execute function protect_club_audit();

    INSERT INTO _migrations (name) VALUES ('0083_coordinator_review_runs.sql');
  END IF;
END
$netlify_apply$;
