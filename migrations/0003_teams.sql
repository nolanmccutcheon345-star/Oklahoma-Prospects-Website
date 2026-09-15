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
