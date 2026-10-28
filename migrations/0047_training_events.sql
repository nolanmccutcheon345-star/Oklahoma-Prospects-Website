create table training_events (
 id text primary key, revision integer not null default 1,
 payload jsonb not null, updated_by text not null, updated_at timestamptz not null default now()
);
create table training_event_registrations (
 id text primary key, event_id text not null references training_events(id),
 athlete_id text not null references club_athletes(id), user_id text not null,
 order_id text not null unique references commerce_orders(id),
 status text not null check(status in ('confirmed','cancelled')),
 created_at timestamptz not null default now()
);
create unique index training_event_player on training_event_registrations(event_id,athlete_id) where status='confirmed';
