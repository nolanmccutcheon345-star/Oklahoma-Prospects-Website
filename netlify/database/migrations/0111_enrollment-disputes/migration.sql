-- Generated from migrations/0111_enrollment_disputes.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0111_enrollment_disputes.sql') THEN
ALTER TABLE square_disputes ADD COLUMN provider_version bigint NOT NULL DEFAULT 0;
CREATE INDEX square_disputes_payment ON square_disputes(payment_id);
CREATE FUNCTION enrollment_recheck_dispute() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot jsonb;
BEGIN
 IF TG_OP='UPDATE' AND NEW.state=OLD.state AND NEW.amount_cents=OLD.amount_cents THEN RETURN NEW; END IF;
 SELECT o.snapshot INTO snapshot FROM square_payments p JOIN commerce_orders o ON o.id=p.order_id
 WHERE p.id=NEW.payment_id AND p.environment='production' AND o.payment_environment='production' AND o.kind='team-fee';
 IF snapshot IS NOT NULL THEN
  UPDATE enrollment_cases SET cleared_at=NULL,cleared_by=NULL,clearance_reason='Owner review required after payment dispute update.'
  WHERE (team_id=snapshot->'teamFee'->>'teamId' AND player_id=snapshot->'teamFee'->>'playerId')
   OR financial_agreement_id=snapshot->'teamFee'->>'financialAgreementId';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enrollment_dispute_review AFTER INSERT OR UPDATE ON square_disputes FOR EACH ROW EXECUTE FUNCTION enrollment_recheck_dispute();
-- Existing unresolved disputes cannot leave a stale clearance in place.
UPDATE enrollment_cases c SET cleared_at=NULL,cleared_by=NULL,clearance_reason='Owner review required for existing payment dispute.'
WHERE c.cleared_at IS NOT NULL AND EXISTS(
 SELECT 1 FROM square_disputes d JOIN square_payments p ON p.id=d.payment_id JOIN commerce_orders o ON o.id=p.order_id
 WHERE p.environment='production' AND o.payment_environment='production' AND o.kind='team-fee' AND upper(d.state) NOT IN ('WON','INQUIRY_CLOSED')
 AND ((c.team_id=o.snapshot->'teamFee'->>'teamId' AND c.player_id=o.snapshot->'teamFee'->>'playerId') OR c.financial_agreement_id=o.snapshot->'teamFee'->>'financialAgreementId')
);

    INSERT INTO _migrations (name) VALUES ('0111_enrollment_disputes.sql');
  END IF;
END
$netlify_apply$;
