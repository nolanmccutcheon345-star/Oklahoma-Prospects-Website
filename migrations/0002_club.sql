create table if not exists profiles (
  user_id text primary key,
  name text not null default '',
  email text not null default '',
  role text not null default 'parent',
  player_name text not null default '',
  assessment_complete boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists reservations (
  id serial primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  date text not null,
  start_time text not null,
  duration_min integer not null,
  price integer not null,
  status text not null default 'paid',
  created_at timestamptz not null default now()
);
create index if not exists reservations_user_id_idx on reservations (user_id);

create table if not exists programs (
  id serial primary key,
  user_id text not null,
  athlete text not null,
  focus text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists drills (
  id serial primary key,
  program_id integer not null,
  user_id text not null,
  name text not null,
  detail text not null default '',
  done boolean not null default false
);

create table if not exists athlete_logs (
  id serial primary key,
  user_id text not null,
  athlete text not null,
  note text not null,
  metric text not null default '',
  created_at timestamptz not null default now()
);
