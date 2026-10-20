-- Generated from migrations/0077_financial_basis_activation.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0077_financial_basis_activation.sql') THEN
-- Permit the reviewed owner activation command to represent active state.
-- This migration does not capture data, backfill bindings, activate any row,
-- grant access, amend financial terms, or perform provider work.
ALTER TABLE financial_basis_state
 DROP CONSTRAINT financial_basis_state_activation_state_check,
 DROP CONSTRAINT financial_basis_state_active_version_check;
ALTER TABLE financial_basis_state
 ADD CONSTRAINT financial_basis_state_activation_state_check
 CHECK (activation_state IN ('captured','active')),
 ADD CONSTRAINT financial_basis_state_active_version_check
 CHECK ((activation_state='captured' AND active_version IS NULL)
   OR (activation_state='active' AND active_version IS NOT NULL AND active_version=current_version)),
 ADD CONSTRAINT financial_basis_active_version
 FOREIGN KEY (id,active_version) REFERENCES financial_basis_versions(basis_id,version)
 DEFERRABLE INITIALLY DEFERRED;

    INSERT INTO _migrations (name) VALUES ('0077_financial_basis_activation.sql');
  END IF;
END
$netlify_apply$;
