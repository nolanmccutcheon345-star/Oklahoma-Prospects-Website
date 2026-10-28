-- Generated from migrations/0112_team_collections.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0112_team_collections.sql') THEN
-- New authorizations only. No historical agreement or card is enrolled by this migration.
CREATE TABLE team_collection_authorizations (
 id uuid PRIMARY KEY, environment text NOT NULL CHECK(environment IN ('sandbox','production')),
 agreement_key text NOT NULL, team_id text NOT NULL, player_id text NOT NULL,
 financial_agreement_id text, locked_at text NOT NULL,
 user_id text NOT NULL REFERENCES "user"(id), customer_id text NOT NULL,
 primary_card_id text, backup_card_id text, primary_display jsonb, backup_display jsonb,
 primary_fingerprint text, backup_fingerprint text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','revoked')),
 terms jsonb NOT NULL, consent_text text, authorized_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(environment,agreement_key)
);
CREATE TABLE team_collection_runs (
 id uuid PRIMARY KEY, authorization_id uuid NOT NULL REFERENCES team_collection_authorizations(id),
 installment_index integer NOT NULL CHECK(installment_index>=0), due_date date NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents>0),
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','primary_pending','primary_declined','backup_pending','failed','paid','review','cancelled')),
 order_id text REFERENCES commerce_orders(id), primary_order_id text REFERENCES commerce_orders(id),
 request_id uuid NOT NULL UNIQUE, backup_request_id uuid NOT NULL UNIQUE,
 primary_attempt_id uuid NOT NULL UNIQUE, backup_attempt_id uuid NOT NULL UNIQUE,
 primary_card_id text NOT NULL, backup_card_id text NOT NULL,
 primary_failure text, backup_failure text,
 next_attempt_at timestamptz NOT NULL, attempted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(authorization_id,installment_index)
);
ALTER TABLE team_collection_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_collection_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON team_collection_authorizations,team_collection_runs FROM public;
CREATE INDEX team_collection_due ON team_collection_runs(status,next_attempt_at);
CREATE INDEX team_collection_active ON team_collection_authorizations(environment,status);
-- Working drafts adopt the owner's new requirement. Published/signed snapshots are untouched.
UPDATE team_fee_plans SET payload=jsonb_set(jsonb_set(payload,'{budget,automaticPayments}','true'::jsonb),'{budget,lateFeeBps}','2000'::jsonb),revision=revision+1,updated_at=now()
WHERE payload->>'status' IN ('draft','pending') AND payload->'published' IS NULL;
UPDATE team_fee_plans SET payload=jsonb_set(payload,'{revision}',to_jsonb(revision))
WHERE payload->>'status' IN ('draft','pending') AND payload->'published' IS NULL;

CREATE FUNCTION enrollment_recheck_collection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='active' AND NEW.status<>'active' THEN
 UPDATE enrollment_cases SET cleared_at=NULL,cleared_by=NULL,clearance_reason='Owner review required after automatic-payment authorization changed.' WHERE (team_id=NEW.team_id AND player_id=NEW.player_id) OR financial_agreement_id=NEW.financial_agreement_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enrollment_collection_review AFTER UPDATE ON team_collection_authorizations FOR EACH ROW EXECUTE FUNCTION enrollment_recheck_collection();

    INSERT INTO _migrations (name) VALUES ('0112_team_collections.sql');
  END IF;
END
$netlify_apply$;
