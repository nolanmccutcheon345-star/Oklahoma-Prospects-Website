-- Generated from migrations/0031_fundraising_roster_links.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0031_fundraising_roster_links.sql') THEN
-- Link explicitly; never infer a roster identity from a name or age label.
ALTER TABLE fundraising_players ADD COLUMN team_id text;
ALTER TABLE fundraising_players ADD COLUMN roster_player_id text;
ALTER TABLE fundraising_players ADD CONSTRAINT fundraising_roster_link_pair CHECK ((team_id IS NULL)=(roster_player_id IS NULL));
CREATE UNIQUE INDEX fundraising_roster_link ON fundraising_players(team_id,roster_player_id) WHERE team_id IS NOT NULL;

    INSERT INTO _migrations (name) VALUES ('0031_fundraising_roster_links.sql');
  END IF;
END
$netlify_apply$;
