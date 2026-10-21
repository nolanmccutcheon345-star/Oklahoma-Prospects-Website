-- Explicit event capabilities and authoritative team bindings. Existing events are not auto-assigned.
alter table coordinator_assignments drop constraint coordinator_assignments_permissions_check;
alter table coordinator_assignments add constraint coordinator_assignments_permissions_check check(permissions <@ array['recruiting.read','tryouts.read','tryouts.status','recruiting.create','recruiting.update','recruiting.status','recruiting.followups','tryouts.attendance','communications.delivery.read','recruiting.notes','contacts.read','rosters.read','rosters.number','rosters.positions','rosters.transfer.request','camps.create','camps.update','clinics.create','clinics.update','events.assign','events.attendance','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','content.draft','content.update','content.submit','reports.read','reports.recruiting','reports.tryouts','reports.openings','reports.attendance','reports.events','reports.followups','teams.openings','teams.needs','teams.statistics','activity.read']::text[]);
create table coordinator_event_scopes (
 event_id text primary key references operational_event_records(id),
 team_id text not null, created_by text not null references "user"(id),
 created_at timestamptz not null default now()
);
create table coordinator_event_cages (
 event_id text not null references operational_event_records(id),
 session_key text not null, booking_id text not null unique references booking_records(id),
 primary key(event_id,session_key)
);
alter table coordinator_event_scopes enable row level security;
alter table coordinator_event_cages enable row level security;
revoke all on coordinator_event_scopes,coordinator_event_cages from public;
