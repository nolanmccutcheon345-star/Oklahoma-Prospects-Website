-- Generated from migrations/0113_collection_queue.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0113_collection_queue.sql') THEN
-- Separate worker scan time from guardian authorization/history timestamps.
ALTER TABLE team_collection_authorizations ADD COLUMN last_checked_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';
CREATE INDEX team_collection_scan ON team_collection_authorizations(environment,status,last_checked_at,id);

    INSERT INTO _migrations (name) VALUES ('0113_collection_queue.sql');
  END IF;
END
$netlify_apply$;
