-- Generated from migrations/0019_v2_completion_records.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0019_v2_completion_records.sql') THEN
alter table booking_records add column completion_recap text;
alter table booking_records add column completed_by text;

    INSERT INTO _migrations (name) VALUES ('0019_v2_completion_records.sql');
  END IF;
END
$netlify_apply$;
