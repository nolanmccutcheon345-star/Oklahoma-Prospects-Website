-- Generated from migrations/0089_coordinator_roster_eligibility.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0089_coordinator_roster_eligibility.sql') THEN
-- Eligibility is explicit and revocable; roster creation never publishes or grants staff access.
alter table coordinator_assignments drop constraint coordinator_assignments_permissions_check;
alter table coordinator_assignments add constraint coordinator_assignments_permissions_check check(permissions <@ array['recruiting.read','tryouts.read','tryouts.create','tryouts.update','events.review.request','tryouts.status','recruiting.create','recruiting.update','recruiting.status','recruiting.followups','tryouts.attendance','communications.delivery.read','recruiting.notes','contacts.read','rosters.read','rosters.add','rosters.information','rosters.number','rosters.positions','rosters.transfer.request','camps.create','camps.update','clinics.create','clinics.update','events.assign','events.attendance','events.read','practices.create','practices.update','events.cancel.request','cages.read','cages.reserve','cages.update','cages.release','communications.read','communications.team.send','communications.recruit.send','content.draft','content.update','content.submit','reports.read','reports.recruiting','reports.tryouts','reports.openings','reports.attendance','reports.events','reports.followups','teams.openings','teams.needs','teams.statistics','activity.read']::text[]);

create table coordinator_roster_clearances (
 id uuid primary key, athlete_id text not null references club_athletes(id), team_id text not null,
 guardian_id text not null references "user"(id), reviewed_by text not null references "user"(id),
 identity_digest text not null, status text not null check(status in ('approved','revoked','used')),
 revision integer not null default 1, reason text not null, expires_at timestamptz not null,
 roster_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index coordinator_active_roster_clearance on coordinator_roster_clearances(athlete_id) where status='approved';
alter table coordinator_roster_clearances enable row level security;
revoke all on coordinator_roster_clearances from public;

    INSERT INTO _migrations (name) VALUES ('0089_coordinator_roster_eligibility.sql');
  END IF;
END
$netlify_apply$;
