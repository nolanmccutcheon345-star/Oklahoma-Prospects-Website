-- Generated from migrations/0003_teams.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0003_teams.sql') THEN
create table if not exists club_state (
  id text primary key default 'oklahoma-prospects',
  rev integer not null default 1,
  demo boolean not null default false,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists club_audit (
  id serial primary key,
  user_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists family_id text not null default '';

    INSERT INTO _migrations (name) VALUES ('0003_teams.sql');
  END IF;
END
$netlify_apply$;
