-- No legacy consent is inferred. Existing pages require explicit owner confirmation.
CREATE TABLE fundraising_publication_consent (
 player_id text PRIMARY KEY REFERENCES fundraising_players(id),
 actor_id text NOT NULL REFERENCES "user"(id),
 accepted_at timestamptz NOT NULL,
 revoked_at timestamptz,
 version text NOT NULL
);
CREATE TABLE fundraising_consent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 player_id text NOT NULL REFERENCES fundraising_players(id),
 actor_id text NOT NULL REFERENCES "user"(id),
 action text NOT NULL CHECK(action IN ('accept','withdraw','invalidate')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 version text NOT NULL
);
