-- Generated from migrations/0124_jose_martin_softball_team_name.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0124_jose_martin_softball_team_name.sql') THEN
-- Rename the existing softball team in place. Its public URL uses the stable team ID.
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
  WHERE team.value->>'id' = 't-prospects-12u-navy-sb-tskv'
    AND team.value->>'sport' = 'softball'
    AND upper(team.value->>'age') = '12U'
    AND lower(btrim(team.value->>'headCoach')) = 'jose martin'
    AND lower(btrim(team.value->>'name')) IN ('prospects 12u navy', 'prospects 12u navy - sb');

  IF team_index IS NOT NULL THEN
    UPDATE club_state
    SET payload = jsonb_set(club, ARRAY['teams', team_index, 'name'], to_jsonb('12U B Maroon'::text)),
        rev = rev + 1,
        updated_at = now()
    WHERE id = 'oklahoma-prospects';
  END IF;
END $$;

    INSERT INTO _migrations (name) VALUES ('0124_jose_martin_softball_team_name.sql');
  END IF;
END
$netlify_apply$;
