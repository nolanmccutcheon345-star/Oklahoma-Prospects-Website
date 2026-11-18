-- Generated from migrations/0120_tryout_request_only.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0120_tryout_request_only.sql') THEN
-- Preserve all existing event behavior; new owner announcements opt in explicitly.
ALTER TABLE tryout_events ADD COLUMN enrollment_mode text NOT NULL DEFAULT 'automatic'
  CHECK (enrollment_mode IN ('automatic', 'request-only'));
ALTER TABLE tryout_events ALTER COLUMN capacity DROP NOT NULL;
ALTER TABLE tryout_events ADD CONSTRAINT tryout_event_mode_capacity CHECK (
  (enrollment_mode = 'automatic' AND capacity IS NOT NULL) OR
  (enrollment_mode = 'request-only' AND capacity IS NULL)
);

    INSERT INTO _migrations (name) VALUES ('0120_tryout_request_only.sql');
  END IF;
END
$netlify_apply$;
