-- Additive home-practice records. Existing athlete, lesson, booking and finance identities remain authoritative.
create table if not exists training_assignments (
 id text primary key, athlete_id text not null references club_athletes(id),
 created_by text not null references "user"(id), created_at timestamptz not null default now(),
 revision integer not null default 1 check(revision>0),
 status text not null check(status in ('active','paused','completed','discontinued')),
 document jsonb not null, updated_at timestamptz not null default now()
);
create index if not exists training_assignments_athlete on training_assignments(athlete_id);
create table if not exists training_practice_logs (
 id text primary key, assignment_id text not null references training_assignments(id),
 athlete_id text not null references club_athletes(id), task_id text not null,
 actor_id text not null references "user"(id), revision integer not null default 1 check(revision>0),
 document jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(assignment_id,task_id)
);
create table if not exists home_training_events (
 id bigserial primary key, athlete_id text not null references club_athletes(id),
 assignment_id text not null references training_assignments(id), actor_id text not null references "user"(id),
 kind text not null, document jsonb not null, created_at timestamptz not null default now()
);
create index if not exists home_training_events_athlete on home_training_events(athlete_id,id);
alter table training_assignments enable row level security;
alter table training_practice_logs enable row level security;
alter table home_training_events enable row level security;
revoke all on training_assignments,training_practice_logs,home_training_events from public;
create trigger audit_change after insert or update or delete on training_assignments for each row execute function record_club_audit();
create trigger audit_change after insert or update or delete on training_practice_logs for each row execute function record_club_audit();
create trigger immutable_training_event before update or delete on home_training_events for each row execute function protect_club_audit();
create table instructor_lesson_presets (
 id text primary key, author_id text not null references "user"(id), name text not null,
 sport text not null, discipline text not null, minutes integer not null,
 status text not null default 'personal' check(status in ('personal','approved','retired')),
 document jsonb not null, created_at timestamptz not null default now(), reviewed_by text references "user"(id),review_note text
);
alter table instructor_lesson_presets enable row level security;
revoke all on instructor_lesson_presets from public;
create trigger audit_change after insert or update or delete on instructor_lesson_presets for each row execute function record_club_audit();
