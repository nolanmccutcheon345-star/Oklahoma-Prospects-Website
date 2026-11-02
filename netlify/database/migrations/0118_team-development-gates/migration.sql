-- Generated from migrations/0118_team_development_gates.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0118_team_development_gates.sql') THEN
-- Team Development safety gates (WO t136u). Defense in depth for the app-level checks:
-- named sports-science and safety reviewers, immutable approved versions, the softball
-- windmill block for every role, and the D-1 "unassigned until reassigned" marker.
-- No count, age or rest values are introduced here.

ALTER TABLE team_dev_program_versions ADD COLUMN IF NOT EXISTS sports_science_reviewed_by text;
ALTER TABLE team_dev_program_versions ADD COLUMN IF NOT EXISTS sports_science_reviewed_at timestamptz;
ALTER TABLE team_dev_program_versions ADD COLUMN IF NOT EXISTS safety_reviewed_by text;
ALTER TABLE team_dev_program_versions ADD COLUMN IF NOT EXISTS safety_reviewed_at timestamptz;
ALTER TABLE team_dev_program_versions ADD COLUMN IF NOT EXISTS non_assignable_reason text;

UPDATE team_dev_program_versions
SET non_assignable_reason = 'softball_windmill_blocked'
WHERE non_assignable_reason IS NULL
  AND status NOT IN ('APPROVED','ACTIVE')
  AND (program_id ~* '^THR-SB-WM-' OR payload->>'windmill_blocked' = 'true'
       OR coalesce(payload->'safety_flags','[]'::jsonb) ? 'WINDMILL_BLOCKED_ALL_ROLES');

CREATE OR REPLACE FUNCTION guard_team_dev_program_version() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('APPROVED','ACTIVE','RETIRED') AND (
      NEW.payload IS DISTINCT FROM OLD.payload
      OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
      OR NEW.blocked_fields IS DISTINCT FROM OLD.blocked_fields
      OR NEW.program_id IS DISTINCT FROM OLD.program_id
      OR NEW.version IS DISTINCT FROM OLD.version) THEN
      RAISE EXCEPTION 'approved team-development versions are immutable; publish a new DRAFT version';
    END IF;
    IF OLD.status = 'RETIRED' AND NEW.status <> 'RETIRED' THEN
      RAISE EXCEPTION 'retired team-development versions cannot be reactivated';
    END IF;
  END IF;
  IF NEW.status IN ('APPROVED','ACTIVE') THEN
    IF NEW.non_assignable_reason IS NOT NULL
       OR NEW.program_id ~* '^THR-SB-WM-'
       OR NEW.payload->>'windmill_blocked' = 'true'
       OR coalesce(NEW.payload->'safety_flags','[]'::jsonb) ? 'WINDMILL_BLOCKED_ALL_ROLES' THEN
      RAISE EXCEPTION 'softball windmill volume is blocked for every role';
    END IF;
    IF jsonb_array_length(coalesce(NEW.blocked_fields,'[]'::jsonb)) > 0 THEN
      RAISE EXCEPTION 'blocked fields must be cleared before approval';
    END IF;
    IF NEW.sports_science_reviewed_by IS NULL OR NEW.safety_reviewed_by IS NULL THEN
      RAISE EXCEPTION 'sports-science and safety reviews are required before approval';
    END IF;
  END IF;
  IF NEW.status = 'ACTIVE' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL) THEN
    RAISE EXCEPTION 'named human expert sign-off is required before activation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS guard_team_dev_program_version_write ON team_dev_program_versions;
CREATE TRIGGER guard_team_dev_program_version_write
  BEFORE INSERT OR UPDATE ON team_dev_program_versions
  FOR EACH ROW EXECUTE FUNCTION guard_team_dev_program_version();

-- S01 Ruling 6 (D-1): cancelling a program while an athlete is held leaves that
-- athlete unassigned for that program type until a logged coach/admin reassignment.
CREATE TABLE IF NOT EXISTS team_dev_unassigned_holds (
  id text PRIMARY KEY,
  athlete_id text NOT NULL,
  team_id text NOT NULL,
  program_type text NOT NULL,
  cancelled_assignment_id text NOT NULL REFERENCES team_dev_assignments(id) ON DELETE RESTRICT,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cleared_at timestamptz,
  cleared_by text,
  cleared_by_assignment_id text REFERENCES team_dev_assignments(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS team_dev_unassigned_holds_open_idx
  ON team_dev_unassigned_holds(athlete_id,team_id,program_type) WHERE cleared_at IS NULL;
ALTER TABLE team_dev_unassigned_holds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='record_club_audit') THEN
    DROP TRIGGER IF EXISTS team_dev_club_audit ON team_dev_unassigned_holds;
    CREATE TRIGGER team_dev_club_audit AFTER INSERT OR UPDATE OR DELETE ON team_dev_unassigned_holds
      FOR EACH ROW EXECUTE FUNCTION record_club_audit();
  END IF;
END $$;

    INSERT INTO _migrations (name) VALUES ('0118_team_development_gates.sql');
  END IF;
END
$netlify_apply$;
