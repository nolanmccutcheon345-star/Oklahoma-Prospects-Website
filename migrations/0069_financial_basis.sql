-- Dormant, additive financial identity foundation. These tables are EMPTY.
-- Never backfill, grant access, activate a reader, or recalculate terms here.
CREATE TABLE financial_basis_state (
 id text PRIMARY KEY CHECK (id = 'oklahoma-prospects'),
 current_version integer NOT NULL CHECK (current_version > 0),
 -- Captured versions are NOT an active cutover. A reviewed future migration is
 -- required even to make activation representable; there is no activation API.
 activation_state text NOT NULL DEFAULT 'captured' CHECK (activation_state = 'captured'),
 active_version integer CHECK (active_version IS NULL),
 source_club_revision integer NOT NULL CHECK (source_club_revision >= 0),
 source_digest text NOT NULL CHECK (length(source_digest) = 64),
 initialized_by text NOT NULL REFERENCES "user"(id),
 initialized_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE financial_basis_versions (
 basis_id text NOT NULL REFERENCES financial_basis_state(id),
 version integer NOT NULL CHECK (version > 0),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
 payload_digest text NOT NULL CHECK (length(payload_digest) = 64),
 changed_by text NOT NULL REFERENCES "user"(id),
 reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (basis_id,version)
);
ALTER TABLE financial_basis_state ADD CONSTRAINT financial_basis_current_version
 FOREIGN KEY(id,current_version) REFERENCES financial_basis_versions(basis_id,version)
 DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE financial_team_seasons (
 id uuid PRIMARY KEY,
 basis_id text NOT NULL REFERENCES financial_basis_state(id),
 original_team_id text NOT NULL CHECK (length(original_team_id) > 0),
 UNIQUE (basis_id,original_team_id),
 UNIQUE (basis_id,id)
);
CREATE TABLE financial_player_agreements (
 id uuid PRIMARY KEY,
 basis_id text NOT NULL,
 team_season_id uuid NOT NULL,
 original_player_id text NOT NULL CHECK (length(original_player_id) > 0),
 FOREIGN KEY(basis_id,team_season_id) REFERENCES financial_team_seasons(basis_id,id),
 UNIQUE (basis_id,team_season_id,original_player_id),
 UNIQUE (basis_id,id)
);
CREATE TABLE financial_team_aliases (
 basis_id text NOT NULL,
 legacy_team_id text NOT NULL CHECK (length(legacy_team_id) > 0),
 team_season_id uuid NOT NULL,
 created_version integer NOT NULL,
 PRIMARY KEY(basis_id,legacy_team_id),
 FOREIGN KEY(basis_id,team_season_id) REFERENCES financial_team_seasons(basis_id,id),
 FOREIGN KEY(basis_id,created_version) REFERENCES financial_basis_versions(basis_id,version)
);
CREATE TABLE financial_player_aliases (
 basis_id text NOT NULL,
 legacy_team_id text NOT NULL CHECK (length(legacy_team_id) > 0),
 legacy_player_id text NOT NULL CHECK (length(legacy_player_id) > 0),
 agreement_id uuid NOT NULL,
 created_version integer NOT NULL,
 PRIMARY KEY(basis_id,legacy_team_id,legacy_player_id),
 FOREIGN KEY(basis_id,agreement_id) REFERENCES financial_player_agreements(basis_id,id),
 FOREIGN KEY(basis_id,created_version) REFERENCES financial_basis_versions(basis_id,version)
);
-- History and legacy aliases are permanent. A transfer may add an alias, never
-- repoint or remove one: old provider orders must still find their agreement.
CREATE FUNCTION protect_financial_basis_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial basis history and identity are append-only'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['financial_basis_versions','financial_team_seasons',
  'financial_player_agreements','financial_team_aliases','financial_player_aliases'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_financial_basis BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_financial_basis_history()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['financial_basis_state','financial_basis_versions','financial_team_seasons',
  'financial_player_agreements','financial_team_aliases','financial_player_aliases'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON %I FROM public',t);
 END LOOP;
END $$;
