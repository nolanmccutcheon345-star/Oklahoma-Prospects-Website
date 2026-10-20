-- Generated from migrations/0072_operational_people.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0072_operational_people.sql') THEN
-- Separate operational contact, directory status and scheduling overlays.
-- No authentication changes, financial source updates, backfill or grants.
create table operational_person_settings (
 user_id text primary key references "user"(id),
 revision integer not null check(revision > 0),
 contact_email text not null default '', phone text not null default '',
 directory_active boolean not null default true,
 coach_id text not null default '', windows jsonb,
 availability_source text not null default '',
 unavailable_service_ids text[] not null default '{}',
 classified_profile_revision integer,
 updated_by text not null references "user"(id),
 updated_at timestamptz not null default now(),
 check(windows is null or jsonb_typeof(windows)='array'),
 check(classified_profile_revision is null or classified_profile_revision > 0)
);
create unique index operational_person_coach_id on operational_person_settings(coach_id) where coach_id<>'';
alter table operational_person_settings enable row level security;
revoke all on operational_person_settings from public;
alter table staff_directory add column identity_email text;
alter table staff_directory add column identity_user_id text references "user"(id);
alter table staff_directory add column operational_bio_version integer;

    INSERT INTO _migrations (name) VALUES ('0072_operational_people.sql');
  END IF;
END
$netlify_apply$;
