-- Generated from migrations/0028_staff_directory.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0028_staff_directory.sql') THEN
-- Staff listings describe public responsibilities; they confer no account access.
create table staff_directory (
  id uuid primary key,
  name text not null,
  title text not null,
  program text not null check (program in ('Baseball','Softball','Organization')),
  email text not null,
  phone text not null default '',
  bio text not null default '',
  published boolean not null default false,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
create unique index staff_directory_email on staff_directory(lower(email));
alter table staff_directory enable row level security;
revoke all on staff_directory from public;

    INSERT INTO _migrations (name) VALUES ('0028_staff_directory.sql');
  END IF;
END
$netlify_apply$;
