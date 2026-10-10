-- Generated from migrations/0048_team_activities.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0048_team_activities.sql') THEN
CREATE TABLE IF NOT EXISTS team_activities (
 id uuid PRIMARY KEY, team_id text NOT NULL, revision integer NOT NULL DEFAULT 1,
 payload jsonb NOT NULL, updated_by text NOT NULL REFERENCES "user"(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_activities_team ON team_activities(team_id);
CREATE TABLE IF NOT EXISTS team_chat_messages (
 id uuid PRIMARY KEY, team_id text NOT NULL, user_id text NOT NULL REFERENCES "user"(id),
 author text NOT NULL, body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_chat_team ON team_chat_messages(team_id,created_at);

    INSERT INTO _migrations (name) VALUES ('0048_team_activities.sql');
  END IF;
END
$netlify_apply$;
