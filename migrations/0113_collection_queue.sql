-- Separate worker scan time from guardian authorization/history timestamps.
ALTER TABLE team_collection_authorizations ADD COLUMN last_checked_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';
CREATE INDEX team_collection_scan ON team_collection_authorizations(environment,status,last_checked_at,id);
