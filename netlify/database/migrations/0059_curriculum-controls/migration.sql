-- Generated from migrations/0059_curriculum_controls.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0059_curriculum_controls.sql') THEN
-- Additive governance for built-in content; saved athlete snapshots are immutable.
create table pd_curriculum_controls (
 kind text not null check(kind in ('drill','program')),
 content_id text not null,
 content_version text not null,
 status text not null check(status in ('review-required','approved','retired')),
 recommended boolean not null default false,
 reviewed_by text not null references "user"(id),
 reviewed_at timestamptz not null default now(),
 review_note text not null,
 revision integer not null default 1,
 primary key(kind,content_id),
 check(not recommended or status='approved')
);
alter table pd_curriculum_controls enable row level security;
revoke all on pd_curriculum_controls from public;
create trigger audit_change after insert or update or delete on pd_curriculum_controls for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0059_curriculum_controls.sql');
  END IF;
END
$netlify_apply$;
