-- Generated from migrations/0060_tryout_center.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0060_tryout_center.sql') THEN
-- Extend the existing intake/workflow. No historical notification backfill.
alter table office_request_work drop constraint office_request_work_follow_up_check;
alter table office_request_work add constraint office_request_work_follow_up_check check(follow_up in ('new','contacted','scheduled','confirmed','attended','no-show','follow-up-needed','offered','accepted','closed'));
alter table office_request_work add column revision integer not null default 1;
alter table office_request_work add column team_id text not null default '';
alter table office_request_work add column follow_up_date date;
alter table registration_readers add column can_manage_tryouts boolean not null default false;
create table tryout_center_preferences (
 user_id text primary key references "user"(id), email_enabled boolean not null default true,
 sports text[] not null default '{}', ages text[] not null default '{}', team_ids text[] not null default '{}'
);
create table tryout_center_activity (
 id text primary key, request_id text not null references club_requests(id), actor_id text references "user"(id),
 kind text not null check(kind in ('email','call','note','family-reply','appointment','workflow')),
 subject text not null default '', body text not null, action_payload jsonb, created_at timestamptz not null default now()
);
create table tryout_center_notices (
 id text primary key, request_id text not null references club_requests(id), recipient_id text references "user"(id),
 email text not null, category text not null default 'general', subject text not null, body text not null, reply_to text not null default '',
 dedupe_key text not null unique, read_at timestamptz,
 status text not null default 'pending' check(status in ('pending','processing','sent','review','skipped','superseded')),
 attempts integer not null default 0, first_attempt_at timestamptz, next_attempt_at timestamptz not null default now(),
 lease_token text, lease_until timestamptz, request_body jsonb, provider_id text, accepted_at timestamptz,
 created_at timestamptz not null default now()
);
create table tryout_appointments (
 id text primary key, request_id text not null references club_requests(id), coach_id text not null references club_staff(id),
 event_id text references tryout_events(id), booking_id text references booking_records(id),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at), location text not null,
 lane_ids text[] not null default '{}', status text not null check(status in ('proposed','confirmed','cancelled')),
 revision integer not null default 1, updated_by text not null references "user"(id), updated_at timestamptz not null default now()
);
create unique index tryout_appointments_active on tryout_appointments(request_id) where status <> 'cancelled';
create index tryout_activity_request on tryout_center_activity(request_id,created_at);
create index tryout_notices_queue on tryout_center_notices(status,next_attempt_at);
create index tryout_notices_user on tryout_center_notices(recipient_id,created_at);
do $$ declare t text; begin
 foreach t in array array['tryout_center_preferences','tryout_center_activity','tryout_center_notices','tryout_appointments'] loop
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public',t);
 execute format('create trigger audit_change after insert or update or delete on %I for each row execute function record_club_audit()',t);
 end loop;
end $$;
-- This trigger only handles future inserts. Retrying the same registration cannot send twice.
create function notify_tryout_coaches() returns trigger language plpgsql as $$
begin
 if new.kind not in ('tryout','team-inquiry') then return new; end if;
 insert into tryout_center_notices(id,request_id,recipient_id,email,subject,body,dedupe_key,status)
 select 'registration:'||new.id||':'||u.id,new.id,u.id,lower(trim(u.email)),
 'New tryout registration',
 'Player: '||coalesce(new.payload->>'player','')||'. A new '||coalesce(new.payload->>'sport','')||' '||coalesce(new.payload->>'age','')||' registration is ready for review. Open the secure Tryouts & Evaluations center: https://prospectssports.club/registrations',
 'registration:'||new.id||':'||u.id,case when coalesce(p.email_enabled,true) then 'pending' else 'skipped' end
 from "user" u left join tryout_center_preferences p on p.user_id=u.id
 where u."disabledAt" is null and u."emailVerified"=true
 and not exists(select 1 from profiles profile where profile.user_id=u.id and profile.role='player')
 and (exists(select 1 from owner_grants g where g.user_id=u.id and g.email=lower(trim(u.email)) and g.revoked_at is null)
 or exists(select 1 from club_staff s where s.active and s.role in ('coach','admin') and lower(trim(s.email))=lower(trim(u.email)) and (s.user_id='' or s.user_id=u.id))
 or exists(select 1 from registration_readers r where r.user_id=u.id and r.email=lower(trim(u.email)) and r.active and r.can_manage_tryouts))
 and (coalesce(cardinality(p.sports),0)=0 or lower(new.payload->>'sport')=any(p.sports))
 and (coalesce(cardinality(p.ages),0)=0 or new.payload->>'age'=any(p.ages))
 and (coalesce(cardinality(p.team_ids),0)=0 or coalesce(new.payload->>'preferredTeamId','')=any(p.team_ids))
 on conflict(dedupe_key) do nothing;
 return new;
end $$;
create trigger tryout_coach_alert after insert on club_requests for each row execute function notify_tryout_coaches();
create table tryout_event_reservations (
 event_id text primary key references tryout_events(id), booking_id text not null references booking_records(id),
 coach_id text not null references club_staff(id), lane_ids text[] not null
);
alter table tryout_event_reservations enable row level security;
revoke all on tryout_event_reservations from public;
create trigger audit_change after insert or update or delete on tryout_event_reservations for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0060_tryout_center.sql');
  END IF;
END
$netlify_apply$;
