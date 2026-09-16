-- Generated from migrations/0006_pd_file.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0006_pd_file.sql') THEN
-- Club player-development working file. Seeded once, then staff/family writes persist.
create table if not exists pd_working_file (
  id text primary key,
  payload text not null,
  updated_at timestamptz not null default now()
);

    INSERT INTO _migrations (name) VALUES ('0006_pd_file.sql');
  END IF;
END
$netlify_apply$;
