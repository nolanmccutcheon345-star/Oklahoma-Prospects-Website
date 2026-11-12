-- Generated from migrations/0119_team_message_removal.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0119_team_message_removal.sql') THEN
-- Preserve source messages and immutable removal receipts, including withheld messages.
create table if not exists team_message_removals (
  channel text not null check (channel in ('team','family')),
  message_id uuid not null,
  team_id text not null,
  actor_id text not null,
  removed_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  author text not null,
  excerpt text not null check (length(excerpt)<=120),
  source_digest text not null,
  primary key(channel,message_id)
);
create or replace function preserve_team_message_removal() returns trigger language plpgsql as $$
begin raise exception 'Message removal receipts are append-only'; end $$;
create trigger team_message_removal_immutable before update or delete on team_message_removals for each row execute function preserve_team_message_removal();
create trigger team_message_removal_no_truncate before truncate on team_message_removals for each statement execute function preserve_team_message_removal();
alter table team_message_removals enable row level security;
revoke all on team_message_removals from public;

    INSERT INTO _migrations (name) VALUES ('0119_team_message_removal.sql');
  END IF;
END
$netlify_apply$;
