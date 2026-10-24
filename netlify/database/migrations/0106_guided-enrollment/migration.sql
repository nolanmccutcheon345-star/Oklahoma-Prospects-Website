-- Generated from migrations/0106_guided_enrollment.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0106_guided_enrollment.sql') THEN
-- Pilot-only by default. No customer enrollment, agreement, charge or permission grant is created.
CREATE TABLE enrollment_rollout (
 id text PRIMARY KEY CHECK(id='academy'), revision integer NOT NULL DEFAULT 0,
 mode text NOT NULL DEFAULT 'pilot' CHECK(mode IN ('pilot','organization')),
 safety_name text NOT NULL DEFAULT 'Steve McCutcheon', safety_contact text NOT NULL DEFAULT '',
 alternate_name text NOT NULL DEFAULT 'Nolan McCutcheon', alternate_contact text NOT NULL DEFAULT '',
 emergency_plan_reference text NOT NULL DEFAULT '', updated_by text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO enrollment_rollout(id) VALUES('academy');
CREATE TABLE enrollment_pilots (
 sport text PRIMARY KEY CHECK(sport IN ('baseball','softball')), team_id text UNIQUE NOT NULL,
 season_key text NOT NULL, signatures_open boolean NOT NULL DEFAULT false,
 pilot_review text NOT NULL DEFAULT '', pilot_passed boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 0, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE enrollment_cases (
 id text PRIMARY KEY, team_id text NOT NULL, player_id text NOT NULL, season_key text NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 cleared_at timestamptz, cleared_by text, clearance_reason text NOT NULL DEFAULT '',
 UNIQUE(team_id,player_id,season_key)
);
CREATE TABLE enrollment_signatures (
 id text PRIMARY KEY, case_id text NOT NULL REFERENCES enrollment_cases(id),
 actor_id text NOT NULL, signer_name text NOT NULL, signed_at timestamptz NOT NULL DEFAULT now(),
 packet_digest text NOT NULL, packet jsonb NOT NULL, statement text NOT NULL,
 UNIQUE(case_id,actor_id,packet_digest)
);
CREATE TRIGGER enrollment_signature_immutable BEFORE UPDATE OR DELETE ON enrollment_signatures FOR EACH ROW EXECUTE FUNCTION protect_handbook_audit();
CREATE TABLE enrollment_medical (
 case_id text PRIMARY KEY REFERENCES enrollment_cases(id), payload jsonb NOT NULL, revision integer NOT NULL DEFAULT 0,
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE enrollment_media (
 case_id text PRIMARY KEY REFERENCES enrollment_cases(id), consent boolean NOT NULL DEFAULT false,
 signer_name text NOT NULL, actor_id text NOT NULL, statement text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE enrollment_media_history (
 id text PRIMARY KEY, case_id text NOT NULL REFERENCES enrollment_cases(id), consent boolean NOT NULL,
 signer_name text NOT NULL, actor_id text NOT NULL, statement text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER enrollment_media_immutable BEFORE UPDATE OR DELETE ON enrollment_media_history FOR EACH ROW EXECUTE FUNCTION protect_handbook_audit();
CREATE TABLE enrollment_safety_reports (
 id text PRIMARY KEY, case_id text NOT NULL REFERENCES enrollment_cases(id), reporter_id text NOT NULL,
 concerning text NOT NULL CHECK(concerning IN ('other','steve','nolan')), body text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','closed')), response text NOT NULL DEFAULT '',
 updated_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['enrollment_rollout','enrollment_pilots','enrollment_cases','enrollment_signatures','enrollment_medical','enrollment_media','enrollment_media_history','enrollment_safety_reports'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
END LOOP; END $$;

ALTER TABLE handbook_documents DROP CONSTRAINT handbook_documents_kind_check;
ALTER TABLE handbook_documents ADD CONSTRAINT handbook_documents_kind_check CHECK(kind IN ('master','baseball','softball','medical','team'));
INSERT INTO handbook_documents(id,kind) VALUES('medical-2027','medical');
INSERT INTO handbook_versions(document_id,version,effective_on,content,review,content_hash,updated_by) VALUES('medical-2027',1,'2027-01-01','{"title":"Emergency Medical Authorization — 2027","sections":[{"title":"Emergency arrangements","body":"If my athlete needs urgent medical attention during an official Prospects activity and the guardian cannot be reached promptly, I authorize Prospects staff to contact emergency services and arrange evaluation and transportation by qualified emergency personnel. Treatment decisions remain with qualified medical professionals under applicable law. Staff should attempt to contact the guardian or designated emergency contact as soon as practical."},{"title":"Medical information and limits","body":"I will keep emergency contacts, relevant medical alerts and activity restrictions current. This authorization does not provide a diagnosis, waive nonwaivable rights, authorize participation against medical restrictions, or replace a provider’s return-to-play clearance. Responsibility for medical costs follows the applicable insurance coverage and signed agreements."}]}'::jsonb,'{}'::jsonb,'7b38918b3428e7b083b9c836fc0e0afdbb4fd2be2176552b537258e30115ef1b','system:2027-framework');

ALTER TABLE enrollment_cases ADD COLUMN financial_agreement_id text;
CREATE OR REPLACE FUNCTION enrollment_recheck_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_key text; snapshot jsonb;
BEGIN
 IF TG_TABLE_NAME='square_payments' THEN
  IF NEW.refunded_cents<=OLD.refunded_cents AND NEW.status=OLD.status THEN RETURN NEW; END IF;
  order_key:=NEW.order_id;
 ELSE
  IF NEW.external_status<>'reconciled' THEN RETURN NEW; END IF;
  order_key:=NEW.order_id;
 END IF;
 SELECT o.snapshot INTO snapshot FROM commerce_orders o WHERE o.id=order_key AND o.kind='team-fee';
 IF snapshot IS NOT NULL THEN
  UPDATE enrollment_cases c SET cleared_at=NULL,cleared_by=NULL,clearance_reason='Owner review required after account update.'
  WHERE c.cleared_at IS NOT NULL AND (
   (c.team_id=snapshot->'teamFee'->>'teamId' AND c.player_id=snapshot->'teamFee'->>'playerId') OR
   c.financial_agreement_id=snapshot->'teamFee'->>'financialAgreementId');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enrollment_payment_review AFTER UPDATE ON square_payments FOR EACH ROW EXECUTE FUNCTION enrollment_recheck_refund();
CREATE TRIGGER enrollment_refund_review AFTER INSERT OR UPDATE ON commerce_refunds FOR EACH ROW EXECUTE FUNCTION enrollment_recheck_refund();
CREATE TRIGGER enrollment_signature_no_truncate BEFORE TRUNCATE ON enrollment_signatures FOR EACH STATEMENT EXECUTE FUNCTION protect_handbook_audit();
CREATE TRIGGER enrollment_media_no_truncate BEFORE TRUNCATE ON enrollment_media_history FOR EACH STATEMENT EXECUTE FUNCTION protect_handbook_audit();
CREATE TRIGGER handbook_audit_no_truncate BEFORE TRUNCATE ON handbook_audit FOR EACH STATEMENT EXECUTE FUNCTION protect_handbook_audit();
CREATE TRIGGER handbook_versions_no_truncate BEFORE TRUNCATE ON handbook_versions FOR EACH STATEMENT EXECUTE FUNCTION protect_handbook_audit();

    INSERT INTO _migrations (name) VALUES ('0106_guided_enrollment.sql');
  END IF;
END
$netlify_apply$;
