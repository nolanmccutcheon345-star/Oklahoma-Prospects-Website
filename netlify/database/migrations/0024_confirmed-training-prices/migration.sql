-- Generated from migrations/0024_confirmed_training_prices.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0024_confirmed_training_prices.sql') THEN
-- Owner-confirmed September 19, 2026. Only catalog prices for new purchases.
-- Paid orders, payment snapshots, subscriptions and credit balances are unchanged.
update club_services set price=239 where id='m1';
update club_services set price=385 where id='p2';
update club_services set price=740 where id='p3';

    INSERT INTO _migrations (name) VALUES ('0024_confirmed_training_prices.sql');
  END IF;
END
$netlify_apply$;
