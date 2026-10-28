-- Generated from migrations/0099_team_pricing_defaults.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0099_team_pricing_defaults.sql') THEN
-- Release defaults are data, editable through the owner master editor after
-- resolution/save. No team, agreement, payment, or immutable basis is rewritten.
CREATE TABLE IF NOT EXISTS team_pricing_default_releases (
  version integer PRIMARY KEY,
  payload jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL
);
INSERT INTO team_pricing_default_releases(version,payload,reason)
VALUES (1,'{"membershipMonthly":8000,"poMembershipMonthly":8000,"contingencyBps":1250,"eventPaymentSchedule":{"percentages":[7000,1500,1500],"weeksBefore":[14,10,6]}}'::jsonb,
'Owner-approved master pricing update: 12.5% contingency, $80 monthly team membership, 70/15/15 at 14/10/6 weeks. Existing row/team overrides and published agreements are preserved.')
ON CONFLICT DO NOTHING;

    INSERT INTO _migrations (name) VALUES ('0099_team_pricing_defaults.sql');
  END IF;
END
$netlify_apply$;
