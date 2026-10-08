-- Generated from migrations/0033_tryout_enrollment.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0033_tryout_enrollment.sql') THEN
create table tryout_enrollments (
 id text primary key,
 event_id text not null references tryout_events(id),
 request_id text not null references club_requests(id),
 applicant_key text not null,
 status text not null check (status in ('enrolled','cancelled')),
 created_at timestamptz not null default now()
);
-- One active group appointment per applicant/sport/age/season, across retry IDs.
create unique index tryout_active_applicant on tryout_enrollments(applicant_key) where status='enrolled';
create table tryout_notification_outbox (
 id text primary key,
 enrollment_id text not null references tryout_enrollments(id),
 event_revision integer not null,
 kind text not null check (kind in ('enrolled','updated','cancelled')),
 status text not null default 'pending' check(status in ('pending','sent','superseded')),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 unique(enrollment_id,event_revision,kind)
);
create trigger audit_change after insert or update on tryout_enrollments for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0033_tryout_enrollment.sql');
  END IF;
END
$netlify_apply$;
