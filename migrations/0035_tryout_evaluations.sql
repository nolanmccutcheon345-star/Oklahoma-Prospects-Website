-- Private coach evaluations; independent rows avoid overwriting the club record.
create table tryout_evaluations (
 id text primary key,
 registration_id text references club_requests(id),
 team_id text not null,
 evaluator_id text not null references "user"(id),
 evaluator_name text not null,
 player_name text not null,
 age_group text not null,
 sport text not null check (sport in ('baseball','softball')),
 evaluation_date date not null,
 status text not null check (status in ('draft','submitted')),
 recommendation text not null check (recommendation in ('undecided','invite','callback','development','incomplete')),
 payload jsonb not null,
 revision integer not null default 1 check (revision > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index tryout_evaluations_team_date on tryout_evaluations(team_id,evaluation_date desc);
create index tryout_evaluations_registration on tryout_evaluations(registration_id);
create trigger audit_change after insert or update or delete on tryout_evaluations
 for each row execute function record_club_audit();
alter table tryout_evaluations enable row level security;
revoke all on tryout_evaluations from public;
