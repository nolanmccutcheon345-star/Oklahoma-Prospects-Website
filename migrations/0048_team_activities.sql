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
