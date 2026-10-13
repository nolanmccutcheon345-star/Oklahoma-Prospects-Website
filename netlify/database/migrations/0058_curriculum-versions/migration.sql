-- Generated from migrations/0058_curriculum_versions.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0058_curriculum_versions.sql') THEN
-- New versions preserve previously assigned instruction snapshots.
create table pd_curriculum_versions (
 id text primary key, parent_id text references pd_curriculum_versions(id),
 author_id text not null references "user"(id), document jsonb not null,
 status text not null default 'draft' check(status in ('draft','approved','retired')),
 reviewed_by text references "user"(id), review_note text, created_at timestamptz not null default now()
);
alter table pd_curriculum_versions enable row level security;
revoke all on pd_curriculum_versions from public;
create trigger audit_change after insert or update or delete on pd_curriculum_versions for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0058_curriculum_versions.sql');
  END IF;
END
$netlify_apply$;
