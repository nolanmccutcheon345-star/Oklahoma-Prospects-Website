-- Generated from migrations/0120_facility_blocks.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0120_facility_blocks.sql') THEN
CREATE TABLE facility_blocks (
  id uuid PRIMARY KEY,
  booking_id text NOT NULL UNIQUE REFERENCES booking_records(id),
  title text NOT NULL CHECK (length(title) BETWEEN 2 AND 140),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by text REFERENCES "user"(id),
  cancelled_at timestamptz
);
ALTER TABLE facility_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON facility_blocks FROM public;

    INSERT INTO _migrations (name) VALUES ('0120_facility_blocks.sql');
  END IF;
END
$netlify_apply$;
