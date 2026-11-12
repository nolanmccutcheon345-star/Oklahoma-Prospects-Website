-- Generated from migrations/0120_roster_assignments.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0120_roster_assignments.sql') THEN
-- t136u: explicit Front Office roster assignments (additive only).
-- One row per (team, roster player) placement plus pre-roster tryout offers. The
-- live roster in club_state remains the operational source; this table records
-- who assigned each athlete, its status and why a second live team was allowed.
-- No existing table, column, fee plan or financial record is changed.
create table if not exists roster_assignments (
 id text primary key,
 team_id text not null,
 roster_player_id text,
 athlete_id text references club_athletes(id),
 request_id text,
 household_id text references club_households(id),
 status text not null check (status in ('invited','accepted','active','removed')),
 source text not null check (source in ('registration','account','office','coach','backfill')),
 additional_team_reason text not null default '',
 revision integer not null default 1,
 created_by text not null,
 updated_by text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (roster_player_id is not null or request_id is not null)
);
create unique index if not exists roster_assignments_team_player on roster_assignments(team_id,roster_player_id) where roster_player_id is not null;
create unique index if not exists roster_assignments_live_request on roster_assignments(request_id) where request_id is not null and status <> 'removed';
create unique index if not exists roster_assignments_live_athlete_team on roster_assignments(athlete_id,team_id) where athlete_id is not null and status <> 'removed';
create index if not exists roster_assignments_live_athlete on roster_assignments(athlete_id) where athlete_id is not null and status <> 'removed';
create index if not exists roster_assignments_team_status on roster_assignments(team_id,status);
create table if not exists roster_assignment_audit (
 id bigserial primary key,
 assignment_id text not null references roster_assignments(id),
 actor_id text not null,
 action text not null,
 from_status text,
 to_status text not null,
 reason text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists roster_assignment_audit_assignment on roster_assignment_audit(assignment_id,created_at);
do $$ begin
 if not exists (select 1 from pg_trigger where tgname='roster_assignment_audit_append_only') then
  create trigger roster_assignment_audit_append_only before update or delete on roster_assignment_audit for each row execute function protect_club_audit();
 end if;
 if not exists (select 1 from pg_trigger where tgname='roster_assignment_audit_no_truncate') then
  create trigger roster_assignment_audit_no_truncate before truncate on roster_assignment_audit for each statement execute function protect_club_audit();
 end if;
end $$;
alter table roster_assignments enable row level security;
alter table roster_assignment_audit enable row level security;
revoke all on roster_assignments, roster_assignment_audit from public;
-- Backfill the current live roster once. Withdrawn players are recorded as removed.
-- Re-running inserts nothing (deterministic ids, on conflict do nothing).
insert into roster_assignments(id,team_id,roster_player_id,athlete_id,request_id,household_id,status,source,created_by,updated_by)
select 'backfill:'||(t->>'id')||':'||(p->>'id'), t->>'id', p->>'id',
 (select l.athlete_id from recruiting_roster_links l where l.team_id=t->>'id' and l.roster_id=p->>'id' limit 1),
 (select r.id from club_requests r where r.payload->>'rosterPlayerId'=p->>'id' order by r.created_at limit 1),
 (select h.id from club_households h where h.id=p->>'familyId'),
 case when p->'withdrawn'='true'::jsonb then 'removed' else 'active' end,
 'backfill','migration:0120','migration:0120'
from club_state c
cross join lateral jsonb_array_elements(case when jsonb_typeof(c.payload->'teams')='array' then c.payload->'teams' else '[]'::jsonb end) t
cross join lateral jsonb_array_elements(case when jsonb_typeof(t->'roster')='array' then t->'roster' else '[]'::jsonb end) p
where c.id='oklahoma-prospects' and not c.demo and coalesce(t->>'id','')<>'' and coalesce(p->>'id','')<>''
on conflict do nothing;
insert into roster_assignment_audit(assignment_id,actor_id,action,from_status,to_status,reason)
select a.id,'migration:0120','backfill',null,a.status,'Recorded from the live roster at migration time.'
from roster_assignments a
where a.source='backfill' and not exists (select 1 from roster_assignment_audit x where x.assignment_id=a.id);

    INSERT INTO _migrations (name) VALUES ('0120_roster_assignments.sql');
  END IF;
END
$netlify_apply$;
