-- Generated from migrations/0115_fee_ready_notifications.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0115_fee_ready_notifications.sql') THEN
-- Event-driven outbox only. Deployment never queues historical recipients.
CREATE TABLE fee_ready_notifications (
 id text PRIMARY KEY,
 team_id text NOT NULL, player_id text NOT NULL, season_key text NOT NULL,
 recipient text NOT NULL, requested_by text NOT NULL,
 snapshot jsonb NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','accepted','review','superseded')),
 request_body jsonb, attempts integer NOT NULL DEFAULT 0,
 first_attempt_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token text, lease_until timestamptz,
 provider_message_id text, accepted_at timestamptz,
 delivery_event text, delivery_checked_at timestamptz
);
ALTER TABLE fee_ready_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fee_ready_notifications FROM public;
CREATE INDEX fee_ready_pending ON fee_ready_notifications(status,next_attempt_at);

    INSERT INTO _migrations (name) VALUES ('0115_fee_ready_notifications.sql');
  END IF;
END
$netlify_apply$;
