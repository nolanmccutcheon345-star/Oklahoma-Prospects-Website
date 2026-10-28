-- Generated from migrations/0107_season_progress.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0107_season_progress.sql') THEN
-- Operational progress; no fee, payment, public-consent or permission changes.
CREATE TABLE enrollment_absence_notices (
 case_id text NOT NULL REFERENCES enrollment_cases(id), activity_key text NOT NULL,
 availability text NOT NULL CHECK(availability IN ('going','absent','late','early')),
 notice_kind text NOT NULL CHECK(notice_kind IN ('planned','emergency')), direct_contact boolean NOT NULL,
 revision integer NOT NULL DEFAULT 0, submitted_by text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
 acknowledged_by text, acknowledged_at timestamptz,
 PRIMARY KEY(case_id,activity_key)
);
CREATE TABLE enrollment_checkpoints (
 id text PRIMARY KEY, case_id text NOT NULL REFERENCES enrollment_cases(id),
 kind text NOT NULL CHECK(kind IN ('baseline','in-season','final')), due_on date NOT NULL,
 completed_on date, feedback text NOT NULL DEFAULT '', athlete_id text NOT NULL,
 assessment_id text REFERENCES athlete_assessments(id), revision integer NOT NULL DEFAULT 0,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE enrollment_checklist (
 case_id text NOT NULL REFERENCES enrollment_cases(id), task_key text NOT NULL CHECK(task_key IN ('uniform','schedule','orientation','goals','day30')),
 completed boolean NOT NULL, revision integer NOT NULL DEFAULT 0,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(case_id,task_key)
);
CREATE TABLE enrollment_travel_contacts (
 case_id text PRIMARY KEY REFERENCES enrollment_cases(id), adult_name text NOT NULL, adult_phone text NOT NULL,
 revision integer NOT NULL DEFAULT 0, guardian_id text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE enrollment_additional_teams (
 team_id text PRIMARY KEY, sport text NOT NULL CHECK(sport IN ('baseball','softball')),season_key text NOT NULL,
 signatures_open boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 0,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['enrollment_absence_notices','enrollment_checkpoints','enrollment_checklist','enrollment_travel_contacts','enrollment_additional_teams'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
END LOOP; END $$;

    INSERT INTO _migrations (name) VALUES ('0107_season_progress.sql');
  END IF;
END
$netlify_apply$;
