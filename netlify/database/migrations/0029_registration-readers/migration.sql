-- Generated from migrations/0029_registration_readers.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0029_registration_readers.sql') THEN
-- Separate, read-only capability; never confers a club role or owner access.
create table registration_readers (
 user_id text primary key references "user"(id) on delete cascade,
 email text not null,
 active boolean not null default true,
 granted_by text not null references "user"(id),
 updated_at timestamptz not null default now()
);
create trigger audit_change after insert or update or delete on registration_readers
 for each row execute function record_club_audit();

    INSERT INTO _migrations (name) VALUES ('0029_registration_readers.sql');
  END IF;
END
$netlify_apply$;
