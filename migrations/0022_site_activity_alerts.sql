-- New events only. Existing audit history is retained and is not replayed as email.
create table site_alert_events (
 id bigint primary key references audit_events(id),
 audience text not null default 'owners',
 batched_at timestamptz
);
create table site_alert_deliveries (
 id text primary key, recipient text not null, audience text not null,
 subject text not null, body text not null,
 status text not null default 'pending', provider_id text,
 first_attempt_at timestamptz, created_at timestamptz not null default now(), sent_at timestamptz
);
create index site_alert_pending on site_alert_events(id) where batched_at is null;
create index site_alert_delivery_pending on site_alert_deliveries(created_at) where status='pending';
create table cage_alert_recipients (
 email text primary key check(email=lower(trim(email))), active boolean not null default true
);
-- Owner-requested notification recipient; this grants no application role or account access.
insert into cage_alert_recipients(email) values('masonb469@icloud.com');
do $$ declare t text; begin
 foreach t in array array['site_alert_events','site_alert_deliveries','cage_alert_recipients'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public',t);
 end loop;
end $$;
create function queue_site_activity_alert() returns trigger language plpgsql as $$
begin
 insert into site_alert_events(id) values(NEW.id) on conflict do nothing;
 return NEW;
end $$;
create trigger queue_site_activity after insert on audit_events for each row execute function queue_site_activity_alert();
-- Extend coverage to saved coaching, availability and legacy business records.
do $$ declare t text; begin
 foreach t in array array['coach_profiles','athlete_assessments','athlete_track_progress',
 'athlete_training_days','athlete_training_logs','athlete_session_metrics',
 'programs','drills','athlete_logs','reservations','billing_invoices','booking_participants'] loop
  execute format('create trigger audit_change after insert or update or delete on %I for each row when (pg_trigger_depth() < 2) execute function record_club_audit()',t);
 end loop;
end $$;
