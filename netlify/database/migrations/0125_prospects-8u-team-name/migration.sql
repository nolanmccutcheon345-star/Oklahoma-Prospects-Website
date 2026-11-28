-- Generated from migrations/0125_prospects_8u_team_name.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0125_prospects_8u_team_name.sql') THEN
-- Keep the 8U baseball team's existing ID and update its name in place.
DO $$
DECLARE
  club jsonb;
  team_index text;
BEGIN
  SELECT payload INTO club
  FROM club_state
  WHERE id = 'oklahoma-prospects' AND NOT demo
  FOR UPDATE;

  SELECT (team.ordinality - 1)::text INTO team_index
  FROM jsonb_array_elements(club->'teams') WITH ORDINALITY AS team(value, ordinality)
  WHERE team.value->>'id' = 't-prospect-navy-8u-ytbb'
    AND team.value->>'sport' = 'baseball'
    AND upper(team.value->>'age') = '8U'
    AND lower(btrim(team.value->>'name')) IN ('prospect navy 8u', 'prospects navy 8u');

  IF team_index IS NOT NULL THEN
    UPDATE club_state
    SET payload = jsonb_set(club, ARRAY['teams', team_index, 'name'], to_jsonb('Prospects 8U'::text)),
        rev = rev + 1,
        updated_at = now()
    WHERE id = 'oklahoma-prospects';
  END IF;
END $$;

    INSERT INTO _migrations (name) VALUES ('0125_prospects_8u_team_name.sql');
  END IF;
END
$netlify_apply$;
