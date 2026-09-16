-- Generated from migrations/0004_pd.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0004_pd.sql') THEN
alter table profiles add column if not exists lesson_credits integer not null default 0;
alter table profiles add column if not exists remote_credits integer not null default 0;
alter table profiles add column if not exists plan_name text not null default '';
alter table profiles add column if not exists plan_price integer not null default 0;

    INSERT INTO _migrations (name) VALUES ('0004_pd.sql');
  END IF;
END
$netlify_apply$;
