-- Additive, default-deny coordinator grants. No role assignments or operational grants are seeded.
create table staff_authorities (
 email text not null references owner_grants(email), capability text not null check(capability in ('staff_roles.manage','staff_activity.read','staff_approvals.review')),
 primary key(email,capability)
);
insert into staff_authorities(email,capability)
 select email,capability from owner_grants cross join unnest(array['staff_roles.manage','staff_activity.read','staff_approvals.review']) capability
 where email in ('stevemccutcheon89@gmail.com','nolanmccutcheon@icloud.com') and revoked_at is null;
create table coordinator_assignments (
 user_id text not null references "user"(id), sport text not null check(sport in ('baseball','softball')),
 role text generated always as (sport || '_coordinator') stored,
 status text not null default 'active' check(status in ('active','suspended','removed')),
 coverage text not null default 'teams' check(coverage in ('sport','teams')),
 team_ids text[] not null default '{}', permissions text[] not null default '{}',
 independent_roles text[] not null default '{}', revision integer not null default 1,
 updated_by text not null references "user"(id), updated_at timestamptz not null default now(),
 primary key(user_id,sport), check(permissions <@ array['recruiting.read','recruiting.create','recruiting.update','recruiting.status','recruiting.notes','contacts.read','rosters.read','rosters.number','rosters.positions','rosters.transfer.request','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','content.draft','content.update','content.submit','reports.read','activity.read']::text[]),
 check(coverage <> 'sport' or cardinality(team_ids)=0)
);
create table coordinator_audit (
 id bigint generated always as identity primary key, actor_id text not null,
 action text not null, sport text, team_id text, target_id text,
 result text not null check(result in ('allowed','denied','conflict')),
 details jsonb not null default '{}', correlation_id uuid not null,
 created_at timestamptz not null default now()
);
create index coordinator_audit_actor on coordinator_audit(actor_id,created_at);
create trigger immutable_audit before update or delete on coordinator_audit for each row execute function protect_club_audit();
create table coordinator_drafts (
 id uuid primary key, user_id text not null references "user"(id),sport text not null check(sport in ('baseball','softball')),
 team_id text not null default '', title text not null, body text not null,
 status text not null default 'draft' check(status in ('draft','submitted','approved','rejected')),
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table coordinator_approvals (
 id uuid primary key, requester_id text not null references "user"(id), sport text not null check(sport in ('baseball','softball')),
 team_id text not null default '', kind text not null check(kind in ('transfer','cancel-event','content')),
 target_id text not null, proposal jsonb not null, reason text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 revision integer not null default 1, reviewer_id text references "user"(id), decision_reason text,
 created_at timestamptz not null default now(), decided_at timestamptz
);
create table coordinator_practice_bookings (
 activity_id uuid primary key references team_activities(id), booking_id text not null references booking_records(id)
);
create table public_leadership (
 user_id text primary key references "user"(id), enabled boolean not null default false,
 titles text[] not null default '{}' check(titles <@ array['Baseball Coordinator','Softball Coordinator']::text[]),
 display_order integer not null default 0, revision integer not null default 1
);
alter table club_requests add column coordinator_revision integer not null default 0;
do $$ declare t text; begin
 foreach t in array array['staff_authorities','coordinator_assignments','coordinator_audit','coordinator_drafts','coordinator_approvals','coordinator_practice_bookings','public_leadership'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public',t);
 end loop;
end $$;
-- Pending coordinator email delivery is revoked along with access, including active sessions.
alter table tryout_center_notices add column coordinator_actor_id text references "user"(id);
create function coordinator_notice_allowed(actor text, request_key text, recipient text) returns boolean language sql stable as $$
 select exists(select 1 from "user" u join coordinator_assignments g on g.user_id=u.id
 join club_requests r on r.id=request_key and r.kind in ('tryout','team-inquiry')
 where u.id=actor and u."disabledAt" is null and u."emailVerified"=true
 and g.status='active' and g.sport=lower(r.payload->>'sport')
 and 'communications.recruit.send'=any(g.permissions) and 'contacts.read'=any(g.permissions)
 and lower(trim(r.payload->>'email'))=recipient
 and (g.coverage='sport' or coalesce(r.payload->>'preferredTeamId','')=any(g.team_ids)))
$$;
revoke all on function coordinator_notice_allowed(text,text,text) from public;
create trigger immutable_coordinator_audit_truncate before truncate on coordinator_audit for each statement execute function protect_club_audit();
-- Mirror only a minimized summary into the existing protected activity/owner-alert pipeline.
create function mirror_coordinator_audit() returns trigger language plpgsql as $$
begin
 insert into audit_events(actor_id,action,target_table,target_id,after_state)
 values(new.actor_id,new.action,'coordinator_activity',coalesce(new.target_id,''),jsonb_build_object('status',new.result,'sport',new.sport,'team_id',new.team_id));
 return new;
end $$;
create trigger coordinator_audit_mirror after insert on coordinator_audit for each row execute function mirror_coordinator_audit();
create function coordinator_session_audit() returns trigger language plpgsql as $$
begin
 if exists(select 1 from coordinator_assignments where user_id=new."userId" and status<>'removed') then
  insert into coordinator_audit(actor_id,action,result,correlation_id) values(new."userId",'account.sign-in','allowed',gen_random_uuid());
 end if;
 return new;
end $$;
create trigger coordinator_sign_in after insert on "session" for each row execute function coordinator_session_audit();
