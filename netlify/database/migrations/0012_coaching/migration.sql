-- Generated from migrations/0012_coaching.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0012_coaching.sql') THEN
create table coach_profiles(id text primary key,user_id text not null unique,profile jsonb not null,published boolean not null default false,updated_at timestamptz not null default now());
create table athlete_training_days(athlete_id text not null references club_athletes(id),day date not null,coach_user_id text not null,focus text not null,game_notes text not null default '',items jsonb not null,updated_at timestamptz not null default now(),primary key(athlete_id,day));
create table athlete_training_logs(athlete_id text not null references club_athletes(id),day date not null,item_id text not null,user_id text not null,completed boolean not null,reps integer,weight numeric,rpe integer,notes text not null default '',updated_at timestamptz not null default now(),primary key(athlete_id,day,item_id));
create table athlete_session_metrics(id text primary key,athlete_id text not null references club_athletes(id),user_id text not null,track text not null,day date not null,successes integer not null,attempts integer not null,notes text not null,verified boolean not null,check(successes>=0 and successes<=attempts and attempts>0));
alter table coach_profiles enable row level security;revoke all on coach_profiles from public;
alter table athlete_training_days enable row level security;revoke all on athlete_training_days from public;
alter table athlete_training_logs enable row level security;revoke all on athlete_training_logs from public;
alter table athlete_session_metrics enable row level security;revoke all on athlete_session_metrics from public;

    INSERT INTO _migrations (name) VALUES ('0012_coaching.sql');
  END IF;
END
$netlify_apply$;
