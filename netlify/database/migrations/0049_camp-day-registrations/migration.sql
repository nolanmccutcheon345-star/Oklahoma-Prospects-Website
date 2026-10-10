-- Generated from migrations/0049_camp_day_registrations.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0049_camp_day_registrations.sql') THEN
-- Selected-day overlap is checked under the training_events row lock at checkout and fulfillment.
-- Keep each order/registration and its immutable selected-session snapshot; allow disjoint dates.
DROP INDEX IF EXISTS training_event_player;
CREATE INDEX training_event_player_days ON training_event_registrations(event_id,athlete_id) WHERE status='confirmed';

    INSERT INTO _migrations (name) VALUES ('0049_camp_day_registrations.sql');
  END IF;
END
$netlify_apply$;
