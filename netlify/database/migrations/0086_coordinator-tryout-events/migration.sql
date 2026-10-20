-- Generated from migrations/0086_coordinator_tryout_events.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0086_coordinator_tryout_events.sql') THEN
-- New capabilities remain unassigned. Existing tryouts are not automatically delegated.
alter table coordinator_assignments drop constraint coordinator_assignments_permissions_check;
alter table coordinator_assignments add constraint coordinator_assignments_permissions_check check(permissions <@ array['recruiting.read','tryouts.read','tryouts.create','tryouts.update','events.review.request','tryouts.status','recruiting.create','recruiting.update','recruiting.status','recruiting.followups','tryouts.attendance','communications.delivery.read','recruiting.notes','contacts.read','rosters.read','rosters.number','rosters.positions','rosters.transfer.request','camps.create','camps.update','clinics.create','clinics.update','events.assign','events.attendance','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','content.draft','content.update','content.submit','reports.read','reports.recruiting','reports.tryouts','reports.openings','reports.attendance','reports.events','reports.followups','teams.openings','teams.needs','teams.statistics','activity.read']::text[]);
create table coordinator_tryout_scopes (
 event_id text primary key references tryout_events(id),
 team_id text not null, creation_digest text not null, created_by text not null references "user"(id),
 created_at timestamptz not null default now()
);
alter table coordinator_tryout_scopes enable row level security;
revoke all on coordinator_tryout_scopes from public;
alter table coordinator_approvals drop constraint coordinator_approvals_kind_check;
alter table coordinator_approvals add constraint coordinator_approvals_kind_check check(kind in ('transfer','cancel-event','content','tryout-change'));

    INSERT INTO _migrations (name) VALUES ('0086_coordinator_tryout_events.sql');
  END IF;
END
$netlify_apply$;
