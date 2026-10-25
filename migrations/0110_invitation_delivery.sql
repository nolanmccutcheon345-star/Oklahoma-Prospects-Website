-- Delivery is explicitly requested per invitation; existing invitations are not queued.
CREATE TABLE invitation_delivery (
 invitation_id text PRIMARY KEY REFERENCES club_invites(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','accepted','review','superseded')),
 requested_by text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
 request_body jsonb, attempts integer NOT NULL DEFAULT 0,
 first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token text, lease_until timestamptz,
 provider_message_id text, accepted_at timestamptz,
 delivery_event text, delivery_checked_at timestamptz
);
ALTER TABLE invitation_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invitation_delivery FROM public;
CREATE INDEX invitation_delivery_pending ON invitation_delivery(status,next_attempt_at);
CREATE INDEX offline_payment_evidence ON finance_audit(record_id,id DESC) WHERE action='Offline team payment verification';
CREATE UNIQUE INDEX manual_payment_request ON finance_audit((after_state->>'requestId')) WHERE action='Manual team payment' AND after_state->>'requestId' IS NOT NULL;
CREATE TRIGGER preserve_finance_audit_truncate BEFORE TRUNCATE ON finance_audit FOR EACH STATEMENT EXECUTE FUNCTION protect_finance_history();
