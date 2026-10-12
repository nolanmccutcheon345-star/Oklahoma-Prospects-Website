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
