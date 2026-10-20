-- Generated from migrations/0076_operational_instruction_access.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0076_operational_instruction_access.sql') THEN
-- Bounded instructor workflow access. No roles, financial entitlements, account
-- changes, commercial assignments or backfill. Operational drafts have explicit
-- provenance so unreviewed legacy narratives are not exposed by this grant.
create table operational_instruction_access (
 user_id text primary key references "user"(id),
 identity_email text not null,
 coach_id text not null unique check(length(coach_id)>0),
 status text not null check(status in ('active','suspended')),
 revision integer not null check(revision>0),
 updated_by text not null references "user"(id),
 updated_at timestamptz not null default now()
);
alter table operational_instruction_access enable row level security;
revoke all on operational_instruction_access from public;
alter table guided_lesson_sessions add column operational_author_id text references "user"(id);

    INSERT INTO _migrations (name) VALUES ('0076_operational_instruction_access.sql');
  END IF;
END
$netlify_apply$;
