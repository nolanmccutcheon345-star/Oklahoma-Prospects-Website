-- Generated from migrations/0046_team_fee_plans.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0046_team_fee_plans.sql') THEN
CREATE TABLE IF NOT EXISTS team_fee_plans (
 team_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 payload JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_fee_business (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0,
 payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

    INSERT INTO _migrations (name) VALUES ('0046_team_fee_plans.sql');
  END IF;
END
$netlify_apply$;
