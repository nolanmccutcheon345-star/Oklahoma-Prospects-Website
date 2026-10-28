-- Generated from migrations/0044_person_profiles.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0044_person_profiles.sql') THEN
-- Additive account-linked staff identity; primary account roles are unchanged.
create table person_profiles (
 user_id text primary key references "user"(id),
 revision integer not null default 1,
 instructor boolean not null default false,
 publish_coach boolean not null default false,
 publish_instructor boolean not null default false,
 profile jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
create table person_player_links (
 user_id text not null references "user"(id),
 player_id text not null,
 primary key(user_id,player_id)
);
create table person_guardian_links (
 user_id text not null references "user"(id),
 household_id text not null references club_households(id),
 primary key(user_id,household_id)
);
alter table person_profiles enable row level security;
alter table person_player_links enable row level security;
alter table person_guardian_links enable row level security;
revoke all on person_profiles,person_player_links,person_guardian_links from public;
create trigger audit_change after insert or update or delete on person_profiles for each row execute function record_club_audit();
create trigger audit_change after insert or update or delete on person_player_links for each row execute function record_club_audit();
create trigger audit_change after insert or update or delete on person_guardian_links for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0044_person_profiles.sql');
  END IF;
END
$netlify_apply$;
