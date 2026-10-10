CREATE TABLE finance_state (id text primary key, revision integer not null default 0, payload jsonb not null);
INSERT INTO finance_state(id,payload) VALUES ('organization','{"profit":0,"reserve":2400000,"tax":0,"restricted":0,"nolanBps":5000,"reviewedThrough":"","reviewNote":"","cadence":"manual"}');
CREATE TABLE finance_records (
 id text primary key, kind text not null, payload jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
CREATE INDEX finance_kind ON finance_records(kind);
CREATE TABLE finance_audit (
 id bigint generated always as identity primary key, actor_id text not null,
 record_id text not null, action text not null, reason text not null,
 before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
CREATE TRIGGER immutable_finance_audit BEFORE UPDATE OR DELETE ON finance_audit FOR EACH ROW EXECUTE FUNCTION protect_club_audit();
CREATE FUNCTION protect_finance_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial records must be canceled or reversed, never deleted'; END $$;
CREATE TRIGGER preserve_finance_records BEFORE DELETE ON finance_records FOR EACH ROW EXECUTE FUNCTION protect_finance_history();
ALTER TABLE finance_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON finance_state,finance_records,finance_audit FROM public;
-- An external refund retains the original refund reservation; Square must not retry it.
ALTER TABLE commerce_refunds ADD COLUMN external_status text;
ALTER TABLE commerce_refunds ADD COLUMN external_reference text;

UPDATE finance_state SET payload=jsonb_set(payload,'{reserve}',coalesce((SELECT payload->'reserveTarget' FROM team_budget_master WHERE id='master'),'2400000'::jsonb)) WHERE id='organization';
CREATE TABLE customer_payment_preferences (
 subscription_id text primary key references club_subscriptions(id),
 primary_card_id text, primary_display jsonb,
 backup_card_id text, backup_display jsonb,
 authorized_by text, authorized_at timestamptz, consent_text text,
 updated_at timestamptz not null default now()
);
ALTER TABLE customer_payment_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON customer_payment_preferences FROM public;
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON customer_payment_preferences FOR EACH ROW EXECUTE FUNCTION record_club_audit();
