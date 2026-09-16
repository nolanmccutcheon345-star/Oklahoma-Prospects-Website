-- Generated from migrations/0014_v2_visits.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0014_v2_visits.sql') THEN
-- Prices apply to new purchases only. Paid snapshots and subscriptions stay intact.
update club_services set price=229 where id='m1';
update club_services set price=370 where id='p2';
update club_services set price=720 where id='p3';

alter table booking_records add column participant_count integer not null default 1 check(participant_count between 1 and 100);
create table booking_participants (
 booking_id text not null references booking_records(id),
 athlete_id text not null references club_athletes(id),
 primary key(booking_id,athlete_id)
);
insert into booking_participants(booking_id,athlete_id)
 select id,athlete_id from booking_records where athlete_id is not null;
-- Counts missing from older cage orders require desk verification before check-in.
alter table booking_records add column participants_verified boolean not null default false;
update booking_records set participants_verified=true where athlete_id is not null;
create table service_resources (
 service_id text primary key references club_services(id),
 lane_ids jsonb not null check(jsonb_typeof(lane_ids)='array')
);
alter table booking_participants enable row level security;
alter table service_resources enable row level security;
revoke all on booking_participants, service_resources from public;
create trigger audit_change after insert or update or delete on service_resources for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0014_v2_visits.sql');
  END IF;
END
$netlify_apply$;
