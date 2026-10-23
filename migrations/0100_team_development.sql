-- Team Development foundation. This migration adds isolated development-library
-- and runtime storage only. It intentionally does not touch team pricing, fees,
-- checkout, Square catalog, existing PD assignments, or financial tables.

CREATE TABLE IF NOT EXISTS team_dev_programs (
  id text PRIMARY KEY,
  name text NOT NULL,
  sport text NOT NULL DEFAULT 'both',
  category text NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_dev_program_versions (
  program_id text NOT NULL REFERENCES team_dev_programs(id) ON DELETE RESTRICT,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SPORTS_SCIENCE_REVIEW','SAFETY_REVIEW','APPROVED','ACTIVE','RETIRED')),
  data_label text NOT NULL DEFAULT 'ESTIMATE' CHECK (data_label IN ('ESTIMATE','VERIFIED')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash text NOT NULL DEFAULT '',
  blocked_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(program_id,version)
);

CREATE TABLE IF NOT EXISTS team_dev_template_items (
  program_id text NOT NULL,
  program_version integer NOT NULL,
  item_key text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  item_type text NOT NULL,
  item_ref text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(program_id,program_version,item_key),
  FOREIGN KEY(program_id,program_version) REFERENCES team_dev_program_versions(program_id,version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_dev_exercises (
  id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT',
  data_label text NOT NULL DEFAULT 'ESTIMATE',
  name text NOT NULL,
  category text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  pd_catalog_ref text,
  disabled_at timestamptz,
  PRIMARY KEY(id,version)
);

CREATE TABLE IF NOT EXISTS team_dev_drills (
  id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT',
  data_label text NOT NULL DEFAULT 'ESTIMATE',
  name text NOT NULL,
  sport text NOT NULL,
  category text NOT NULL DEFAULT 'skill',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  pd_catalog_ref text,
  disabled_at timestamptz,
  PRIMARY KEY(id,version)
);

CREATE TABLE IF NOT EXISTS team_dev_sources (
  id text PRIMARY KEY,
  label text NOT NULL,
  citation text NOT NULL DEFAULT '',
  url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_dev_config_items (
  id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  kind text NOT NULL,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_label text NOT NULL DEFAULT 'ESTIMATE',
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id,version)
);

CREATE TABLE IF NOT EXISTS team_dev_metric_defs (
  id text PRIMARY KEY,
  label text NOT NULL,
  unit text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_dev_age_band_ceilings (
  id text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  sport text NOT NULL,
  age_band text NOT NULL,
  kind text NOT NULL,
  value_status text NOT NULL DEFAULT 'PROPOSED' CHECK (value_status IN ('PROPOSED','APPROVED','RETIRED')),
  value jsonb,
  approved_by text,
  approved_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(id,version)
);

CREATE TABLE IF NOT EXISTS team_dev_roster_links (
  id text PRIMARY KEY,
  team_id text NOT NULL,
  roster_player_id text NOT NULL,
  athlete_id text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by text,
  ended_at timestamptz,
  ended_by text,
  UNIQUE(team_id,roster_player_id,athlete_id,linked_at)
);
CREATE INDEX IF NOT EXISTS team_dev_roster_links_active_team_idx ON team_dev_roster_links(team_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS team_dev_roster_links_active_athlete_idx ON team_dev_roster_links(athlete_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS team_dev_assignments (
  id text PRIMARY KEY,
  team_id text NOT NULL,
  program_type text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('team','position','selected','override')),
  program_id text NOT NULL,
  program_version integer NOT NULL,
  program_snapshot jsonb NOT NULL,
  start_date date NOT NULL,
  end_date date,
  inherit_new_players boolean NOT NULL DEFAULT false,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended','paused')),
  revision integer NOT NULL DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(program_id,program_version) REFERENCES team_dev_program_versions(program_id,version) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS team_dev_assignment_targets (
  assignment_id text NOT NULL REFERENCES team_dev_assignments(id) ON DELETE CASCADE,
  athlete_id text,
  position text,
  target_key text NOT NULL,
  program_type text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('team','position','selected','override')),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(assignment_id,target_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS team_dev_assignment_same_tier_active_uq
ON team_dev_assignment_targets(target_key,program_type,scope)
WHERE active;

CREATE TABLE IF NOT EXISTS team_dev_phases (
  id text PRIMARY KEY,
  assignment_id text NOT NULL REFERENCES team_dev_assignments(id) ON DELETE CASCADE,
  phase_index integer NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(assignment_id,phase_index)
);

CREATE TABLE IF NOT EXISTS team_dev_items (
  id text PRIMARY KEY,
  assignment_id text NOT NULL REFERENCES team_dev_assignments(id) ON DELETE CASCADE,
  athlete_id text NOT NULL,
  phase_id text REFERENCES team_dev_phases(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'assigned' CHECK (state IN ('assigned','started','completed','missed','skipped_by_coach','modified','expired')),
  due_date date NOT NULL,
  phase_end_date date NOT NULL,
  late_credit_window_end date NOT NULL,
  is_late boolean NOT NULL DEFAULT false,
  late_attempt_on date,
  late_rejected_reason text,
  paused_reason text,
  pause_id text,
  overridden_by_assignment_id text REFERENCES team_dev_assignments(id) ON DELETE SET NULL,
  assignment_scope text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_dev_items_athlete_due_idx ON team_dev_items(athlete_id,due_date);

CREATE TABLE IF NOT EXISTS team_dev_notes (
  id text PRIMARY KEY,
  assignment_id text REFERENCES team_dev_assignments(id) ON DELETE CASCADE,
  athlete_id text NOT NULL,
  author_id text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_dev_metrics (
  id text PRIMARY KEY,
  athlete_id text NOT NULL,
  metric_id text NOT NULL REFERENCES team_dev_metric_defs(id) ON DELETE RESTRICT,
  value numeric,
  unit text NOT NULL,
  measured_on date NOT NULL,
  recorded_by text NOT NULL,
  evidence_status text NOT NULL CHECK (evidence_status IN ('measured','estimated','unverified')),
  consent_checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_dev_reassessments (
  id text PRIMARY KEY,
  athlete_id text NOT NULL,
  assignment_id text REFERENCES team_dev_assignments(id) ON DELETE SET NULL,
  scheduled_on date,
  performed_on date,
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_dev_player_levels (
  id text PRIMARY KEY,
  athlete_id text NOT NULL,
  program_area text NOT NULL,
  level_id text NOT NULL,
  reason text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_dev_player_settings (
  athlete_id text PRIMARY KEY,
  self_complete_enabled boolean NOT NULL DEFAULT false,
  player_input_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  development_data_consent boolean NOT NULL DEFAULT false,
  consent_recorded_by text,
  consent_recorded_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS team_dev_notify_prefs (
  athlete_id text NOT NULL,
  event_key text NOT NULL,
  in_app boolean NOT NULL DEFAULT false,
  email boolean NOT NULL DEFAULT false,
  PRIMARY KEY(athlete_id,event_key)
);

CREATE TABLE IF NOT EXISTS team_dev_deletion_queue (
  id text PRIMARY KEY,
  athlete_id text NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'requested',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO team_dev_config_items(id,version,kind,label,active,payload,data_label)
VALUES ('late_credit_window_days',1,'runtime','Late credit window',true,'{"days":7}'::jsonb,'ESTIMATE')
ON CONFLICT(id,version) DO NOTHING;

CREATE TABLE IF NOT EXISTS team_dev_events (
  id bigserial PRIMARY KEY,
  actor_id text,
  athlete_id text,
  team_id text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION protect_team_dev_events() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'team_dev_events is append-only';
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_team_dev_events_mutation ON team_dev_events;
CREATE TRIGGER protect_team_dev_events_mutation
BEFORE UPDATE OR DELETE ON team_dev_events
FOR EACH ROW EXECUTE FUNCTION protect_team_dev_events();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'team_dev_programs','team_dev_program_versions','team_dev_template_items',
    'team_dev_exercises','team_dev_drills','team_dev_sources','team_dev_config_items',
    'team_dev_metric_defs','team_dev_age_band_ceilings','team_dev_roster_links',
    'team_dev_assignments','team_dev_assignment_targets','team_dev_phases','team_dev_items',
    'team_dev_notes','team_dev_metrics','team_dev_reassessments','team_dev_player_levels',
    'team_dev_player_settings','team_dev_notify_prefs','team_dev_deletion_queue','team_dev_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;

-- Reuse the academy-wide audit trigger when present. The application also writes
-- team_dev_events explicitly for domain-specific before/after history.
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='record_club_audit') THEN
    FOREACH t IN ARRAY ARRAY[
      'team_dev_programs','team_dev_program_versions','team_dev_exercises','team_dev_drills',
      'team_dev_config_items','team_dev_age_band_ceilings','team_dev_roster_links',
      'team_dev_assignments','team_dev_items','team_dev_notes','team_dev_metrics',
      'team_dev_reassessments','team_dev_player_levels','team_dev_player_settings',
      'team_dev_notify_prefs','team_dev_deletion_queue'
    ]
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS team_dev_club_audit ON %I',t);
      EXECUTE format('CREATE TRIGGER team_dev_club_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_club_audit()',t);
    END LOOP;
  END IF;
END $$;
