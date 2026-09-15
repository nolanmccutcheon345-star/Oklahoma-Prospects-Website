-- Club player-development working file. Seeded once, then staff/family writes persist.
create table if not exists pd_working_file (
  id text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
);
