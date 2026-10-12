-- Generated from migrations/0055_site_alert_digest.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0055_site_alert_digest.sql') THEN
-- Each local date is claimed atomically with its digest deliveries.
-- Audit history and already queued customer mail are preserved.
create table site_alert_digest_runs (
  day date primary key,
  created_at timestamptz not null default now()
);
alter table site_alert_digest_runs enable row level security;
revoke all on site_alert_digest_runs from public;
create index site_alert_events_daily on site_alert_events(id)
  where batched_at is null and audience='daily';

    INSERT INTO _migrations (name) VALUES ('0055_site_alert_digest.sql');
  END IF;
END
$netlify_apply$;
