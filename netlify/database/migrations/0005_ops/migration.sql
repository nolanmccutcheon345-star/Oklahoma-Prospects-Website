-- Generated from migrations/0005_ops.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0005_ops.sql') THEN
-- Club operations: live catalog, instructors, and profit splits.
-- Seeded on first read from src/lib/ops.ts so admin edits persist.

create table if not exists club_services (
  id text primary key,
  kind text not null,
  name text not null,
  discipline text not null default '',
  price integer not null default 0,
  minutes integer not null default 0,
  purpose text not null default '',
  entry boolean not null default false,
  group_session boolean not null default false,
  requires_assessment boolean not null default false,
  credits integer not null default 0,
  remote integer not null default 0,
  expires_days integer not null default 0,
  hours integer not null default 0,
  featured boolean not null default false,
  detail text not null default '',
  includes_json text not null default '[]',
  extra_json text not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists club_services_kind_idx on club_services (kind, sort_order);

create table if not exists club_staff (
  id text primary key,
  user_id text not null default '',
  name text not null,
  email text not null default '',
  phone text not null default '',
  role text not null default 'coach',
  access_notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists club_staff_email_idx on club_staff (email);

create table if not exists club_staff_services (
  staff_id text not null,
  service_id text not null,
  profit_split integer not null default 60,
  primary key (staff_id, service_id)
);

    INSERT INTO _migrations (name) VALUES ('0005_ops.sql');
  END IF;
END
$netlify_apply$;
