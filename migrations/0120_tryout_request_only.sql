-- Preserve all existing event behavior; new owner announcements opt in explicitly.
ALTER TABLE tryout_events ADD COLUMN enrollment_mode text NOT NULL DEFAULT 'automatic'
  CHECK (enrollment_mode IN ('automatic', 'request-only'));
ALTER TABLE tryout_events ALTER COLUMN capacity DROP NOT NULL;
ALTER TABLE tryout_events ADD CONSTRAINT tryout_event_mode_capacity CHECK (
  (enrollment_mode = 'automatic' AND capacity IS NOT NULL) OR
  (enrollment_mode = 'request-only' AND capacity IS NULL)
);
