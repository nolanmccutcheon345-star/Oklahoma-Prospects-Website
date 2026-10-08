-- Staff-published baseball and softball game schedules, scores and approved media.
-- Deliberately contains no athlete, guardian, lineup, or recording-upload fields.
create table games_events (
 id uuid primary key,
 sport text not null check (sport in ('Baseball','Softball')),
 age_group text not null default '',
 team_name text not null,
 opponent text not null,
 game_date date not null,
 start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 venue text not null default '',
 status text not null check (status in ('draft','scheduled','live','final','cancelled')),
 our_runs integer not null default 0 check (our_runs between 0 and 999),
 opp_runs integer not null default 0 check (opp_runs between 0 and 999),
 inning text not null default '',
 video_id text not null default '' check (video_id='' or video_id ~ '^[A-Za-z0-9_-]{11}$'),
 video_kind text not null default 'none' check (video_kind in ('none','live','replay','highlight')),
 media_approved boolean not null default false,
 published boolean not null default false,
 revision integer not null default 1 check (revision>0),
 updated_by text references "user"(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint game_video_media_gate check (
   (video_kind='none' and video_id='') or
   (video_kind<>'none' and video_id<>'')
 )
);
create index games_events_public_date on games_events(game_date desc,start_time,id) where published;
create trigger audit_change after insert or update or delete on games_events for each row execute function record_club_audit();
alter table games_events enable row level security;
revoke all on games_events from public;
