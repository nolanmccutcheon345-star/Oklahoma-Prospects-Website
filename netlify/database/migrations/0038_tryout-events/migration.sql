-- Generated from migrations/0032_tryout_events.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0032_tryout_events.sql') THEN
-- Explicit admin events only; no invented/backfilled tryout dates.
create table tryout_events (
 id text primary key,
 sport text not null check (sport in ('Baseball','Softball')),
 season text not null check (length(trim(season)) between 1 and 120),
 age_groups text[] not null check (cardinality(age_groups)>0),
 event_date date not null,
 start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and end_time>start_time),
 location text not null check (length(trim(location)) between 1 and 500),
 capacity integer not null check (capacity between 1 and 1000),
 status text not null check (status in ('draft','published','cancelled')),
 revision integer not null default 1,
 updated_by text not null references "user"(id),
 updated_at timestamptz not null default now()
);
create trigger audit_change after insert or update on tryout_events
 for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0032_tryout_events.sql');
  END IF;
END
$netlify_apply$;
