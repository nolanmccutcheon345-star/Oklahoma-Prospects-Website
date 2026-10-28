-- Generated from migrations/0114_independent_team_finances.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0114_independent_team_finances.sql') THEN
-- No enrollment, pricing conversion, payment or notification is created here.
-- These records never enter finance_records or the Prospects Square ledger.
CREATE TABLE independent_team_spaces (
 id uuid PRIMARY KEY, team_id text NOT NULL, revision integer NOT NULL DEFAULT 0,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE independent_team_grants (
 season_id uuid NOT NULL REFERENCES independent_team_spaces(id), user_id text NOT NULL REFERENCES "user"(id),
 capabilities jsonb NOT NULL, granted_by text NOT NULL REFERENCES "user"(id),
 revoked_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(season_id,user_id)
);
CREATE TABLE independent_team_entries (
 id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES independent_team_spaces(id),
 request_id uuid NOT NULL, actor_id text NOT NULL REFERENCES "user"(id), actor_role text NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(season_id,request_id)
);
CREATE TABLE independent_team_documents (
 id uuid PRIMARY KEY, season_id uuid NOT NULL REFERENCES independent_team_spaces(id),
 entry_id uuid NOT NULL REFERENCES independent_team_entries(id), filename text NOT NULL,
 mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
 body text NOT NULL, actor_id text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE independent_team_audit (
 id bigserial PRIMARY KEY, season_id uuid NOT NULL REFERENCES independent_team_spaces(id),
 actor_id text NOT NULL REFERENCES "user"(id), actor_role text NOT NULL, action text NOT NULL,
 detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_independent_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Independent financial history is append-only; post a linked correction.'; END $$;
CREATE TRIGGER independent_entries_immutable BEFORE UPDATE OR DELETE ON independent_team_entries FOR EACH ROW EXECUTE FUNCTION protect_independent_history();
CREATE TRIGGER independent_audit_immutable BEFORE UPDATE OR DELETE ON independent_team_audit FOR EACH ROW EXECUTE FUNCTION protect_independent_history();
CREATE TRIGGER independent_documents_immutable BEFORE UPDATE OR DELETE ON independent_team_documents FOR EACH ROW EXECUTE FUNCTION protect_independent_history();
ALTER TABLE independent_team_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE independent_team_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE independent_team_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE independent_team_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE independent_team_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON independent_team_spaces,independent_team_grants,independent_team_entries,independent_team_documents,independent_team_audit FROM public;
CREATE INDEX independent_entries_season ON independent_team_entries(season_id,created_at,id);
CREATE INDEX independent_grants_user ON independent_team_grants(user_id) WHERE revoked_at IS NULL;

    INSERT INTO _migrations (name) VALUES ('0114_independent_team_finances.sql');
  END IF;
END
$netlify_apply$;
