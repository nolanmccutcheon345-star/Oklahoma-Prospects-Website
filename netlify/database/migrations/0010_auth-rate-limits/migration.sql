-- Generated from migrations/0010_auth_rate_limits.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0010_auth_rate_limits.sql') THEN
create table if not exists "rateLimit" (
  id text primary key, key text not null unique, count integer not null,
  "lastRequest" bigint not null
);
alter table "rateLimit" enable row level security;
revoke all on "rateLimit" from public;

    INSERT INTO _migrations (name) VALUES ('0010_auth_rate_limits.sql');
  END IF;
END
$netlify_apply$;
