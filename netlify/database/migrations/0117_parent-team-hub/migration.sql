-- Generated from migrations/0117_parent_team_hub.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0117_parent_team_hub.sql') THEN
-- Team communication data is private and served only through verified membership checks.
create table if not exists team_hub_posts (
 id uuid primary key, team_id text not null, author_id text not null references "user"(id),
 author text not null, title text not null, body text not null, urgent boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists team_hub_posts_team on team_hub_posts(team_id,created_at desc);
create table if not exists team_hub_acknowledgments (
 team_id text not null, post_key text not null, user_id text not null references "user"(id),
 created_at timestamptz not null default now(), primary key(team_id,post_key,user_id)
);
create table if not exists team_hub_rsvps (
 team_id text not null, event_id text not null, player_id text not null,
 response text not null check(response in ('going','maybe','cant')),
 user_id text not null references "user"(id), updated_at timestamptz not null default now(),
 primary key(team_id,event_id,player_id)
);
create table if not exists team_hub_family_messages (
 id uuid primary key, team_id text not null, player_id text not null, family_id text not null,
 author_id text not null references "user"(id), author text not null, body text not null,
 created_at timestamptz not null default now()
);
create index if not exists team_hub_family_messages_thread on team_hub_family_messages(team_id,player_id,family_id,created_at desc);

    INSERT INTO _migrations (name) VALUES ('0117_parent_team_hub.sql');
  END IF;
END
$netlify_apply$;
