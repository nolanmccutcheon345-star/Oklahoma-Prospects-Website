-- Generated from migrations/0030_fundraising_publication_consent.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0030_fundraising_publication_consent.sql') THEN
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

    INSERT INTO _migrations (name) VALUES ('0030_fundraising_publication_consent.sql');
  END IF;
END
$netlify_apply$;
