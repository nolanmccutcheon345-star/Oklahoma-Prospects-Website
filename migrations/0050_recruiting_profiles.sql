CREATE TABLE recruiting_profiles (
 athlete_id text PRIMARY KEY REFERENCES club_athletes(id), revision integer NOT NULL DEFAULT 1,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb, published boolean NOT NULL DEFAULT false,
 consent_by text REFERENCES "user"(id), consent_name text, consent_at timestamptz,
 consent_version text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recruiting_roster_links (
 athlete_id text NOT NULL REFERENCES club_athletes(id), team_id text NOT NULL, roster_id text NOT NULL,
 linked_by text NOT NULL REFERENCES "user"(id), PRIMARY KEY(team_id,roster_id)
);
CREATE INDEX recruiting_links_player ON recruiting_roster_links(athlete_id);
CREATE TABLE recruiting_metrics (
 id uuid PRIMARY KEY, athlete_id text NOT NULL REFERENCES club_athletes(id), metric text NOT NULL,
 value numeric NOT NULL, measured_on date NOT NULL, evidence text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('unverified','pending','verified','rejected')),
 revision integer NOT NULL DEFAULT 1, submitted_by text NOT NULL REFERENCES "user"(id),
 verified_by text REFERENCES "user"(id), verifier_name text, verified_at timestamptz,
 method text NOT NULL DEFAULT '', review_note text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(athlete_id,metric)
);
CREATE INDEX recruiting_pending ON recruiting_metrics(status);
