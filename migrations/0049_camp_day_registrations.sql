-- Selected-day overlap is checked under the training_events row lock at checkout and fulfillment.
-- Keep each order/registration and its immutable selected-session snapshot; allow disjoint dates.
DROP INDEX IF EXISTS training_event_player;
CREATE INDEX training_event_player_days ON training_event_registrations(event_id,athlete_id) WHERE status='confirmed';
