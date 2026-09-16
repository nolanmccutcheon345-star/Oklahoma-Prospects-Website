-- Generated from migrations/0009_commerce.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0009_commerce.sql') THEN
create table club_athletes (
  id text primary key, user_id text, household_email text not null,
  name text not null, birth_date date, coach_ids jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index club_athletes_user on club_athletes(user_id);
create table athlete_assessments (
  id text primary key, athlete_id text not null references club_athletes(id),
  discipline text not null, coach_user_id text not null, completed_at timestamptz not null,
  notes text not null, booking_id text, delivery text not null default 'in-person'
);
create index athlete_assessments_athlete on athlete_assessments(athlete_id);
create table commerce_orders (
  id text primary key, request_key text not null unique, user_id text,
  email text not null, athlete_id text references club_athletes(id),
  product_id text not null, kind text not null, snapshot jsonb not null,
  total_cents integer not null check(total_cents >= 0), currency text not null default 'usd',
  status text not null default 'pending', checkout_session_id text unique,
  checkout_url text, payment_intent_id text, stripe_customer_id text, subscription_id text,
  receipt_url text, hold_until timestamptz, paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index commerce_orders_user on commerce_orders(user_id,created_at);
create table booking_records (
  id text primary key, order_id text references commerce_orders(id), user_id text,
  athlete_id text references club_athletes(id), coach_id text, product_id text not null,
  starts_at timestamptz not null check(mod(extract(epoch from starts_at)::numeric,300) = 0),
  ends_at timestamptz not null check(ends_at > starts_at and mod(extract(epoch from ends_at)::numeric,300) = 0),
  resources jsonb not null, status text not null default 'held',
  checked_in_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now()
);
-- Five-minute occupancy cells have a database UNIQUE key. The whole window and
-- every requested resource are acquired in one transaction, including 75-minute assessments.
create table booking_occupancy (
  resource_id text not null, slot_at timestamptz not null check(mod(extract(epoch from slot_at)::numeric,300) = 0),
  booking_id text not null references booking_records(id) on delete cascade,
  primary key(resource_id,slot_at)
);
create index booking_records_order on booking_records(order_id);
create table stripe_events (
  id text primary key, type text not null, processed_at timestamptz not null default now()
);
create table club_subscriptions (
  id text primary key, order_id text not null references commerce_orders(id), user_id text,
  athlete_id text references club_athletes(id), product_id text not null,
  customer_id text not null, status text not null, amount_cents integer not null,
  period_start timestamptz, period_end timestamptz, cancel_at_period_end boolean not null default false,
  pause_requested_at timestamptz, updated_at timestamptz not null default now()
);
create table credit_grants (
  id text primary key, user_id text, athlete_id text references club_athletes(id),
  order_id text references commerce_orders(id), subscription_id text references club_subscriptions(id),
  source_key text not null unique, kind text not null, minutes integer not null,
  quantity integer not null check(quantity >= 0), remaining integer not null check(remaining >= 0 and remaining <= quantity),
  starts_at timestamptz not null, expires_at timestamptz not null,
  rollover boolean not null default false, created_at timestamptz not null default now()
);
create table credit_uses (
  id text primary key, grant_id text not null references credit_grants(id),
  booking_id text not null references booking_records(id), quantity integer not null check(quantity > 0),
  unique(grant_id,booking_id)
);
create table billing_invoices (
  id text primary key, user_id text, subscription_id text references club_subscriptions(id),
  amount_cents integer not null, status text not null, invoice_url text, pdf_url text,
  period_start timestamptz, period_end timestamptz, created_at timestamptz not null default now()
);
create table commerce_refunds (
  id text primary key, order_id text not null references commerce_orders(id),
  booking_id text references booking_records(id), user_id text not null,
  amount_cents integer not null check(amount_cents >= 0), status text not null,
  stripe_refund_id text unique, reason text not null, created_at timestamptz not null default now(),
  unique(order_id)
);
create table contractor_earnings (
  booking_id text primary key references booking_records(id), coach_id text not null,
  gross_cents integer not null, split_pct numeric not null check(split_pct >= 0 and split_pct <= 100),
  amount_cents integer not null, status text not null default 'pending',
  transfer_id text unique, updated_at timestamptz not null default now()
);
create table club_requests (
  id text primary key, user_id text, kind text not null, payload jsonb not null,
  status text not null default 'open', created_at timestamptz not null default now()
);
create table api_rate_limits (key text primary key, count integer not null, resets_at timestamptz not null);
create table club_waivers (
  id text primary key, user_id text not null, athlete_id text not null references club_athletes(id),
  version text not null, signer_name text not null, signed_at timestamptz not null default now(),
  consent_text text not null, unique(athlete_id,version)
);
create table club_invites (
  id text primary key, token_hash text not null unique, email text not null,
  team_id text, family_id text, invited_by text not null, role text not null,
  status text not null default 'pending', expires_at timestamptz not null,
  accepted_by text, created_at timestamptz not null default now()
);
create table athlete_track_progress (
  athlete_id text not null references club_athletes(id), track text not null,
  level integer not null check(level between 1 and 7), coach_user_id text not null,
  evidence text not null, updated_at timestamptz not null default now(), primary key(athlete_id,track)
);
do $$ declare t text;
begin
  foreach t in array array['club_athletes','athlete_assessments','commerce_orders','booking_records',
    'booking_occupancy','stripe_events','club_subscriptions','credit_grants','credit_uses','billing_invoices',
    'commerce_refunds','contractor_earnings','club_requests','api_rate_limits','club_waivers','club_invites','athlete_track_progress'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on %I from public',t);
  end loop;
end $$;

    INSERT INTO _migrations (name) VALUES ('0009_commerce.sql');
  END IF;
END
$netlify_apply$;
