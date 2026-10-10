-- Generated from migrations/0051_lesson_metric_verification.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0051_lesson_metric_verification.sql') THEN
ALTER TABLE recruiting_metrics ADD COLUMN source_booking_id text REFERENCES booking_records(id);

    INSERT INTO _migrations (name) VALUES ('0051_lesson_metric_verification.sql');
  END IF;
END
$netlify_apply$;
