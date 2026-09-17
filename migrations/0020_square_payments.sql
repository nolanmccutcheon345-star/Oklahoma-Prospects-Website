-- Additive migration: preserve historical processor records and financial audit history.
alter table commerce_orders add column payment_provider text not null default 'stripe';
alter table commerce_orders add column payment_environment text;
alter table commerce_orders add column square_customer_id text;
alter table commerce_orders add column square_card_id text;
alter table commerce_orders add column square_payment_id text unique;
alter table commerce_orders add column subscription_setup_status text;
alter table club_subscriptions add column payment_provider text not null default 'stripe';
alter table club_subscriptions add column provider_version bigint;
alter table club_subscriptions add column scheduled_action text;
alter table club_subscriptions add column action_effective_date date;
alter table commerce_refunds drop constraint commerce_refunds_order_id_key;
create unique index commerce_refunds_legacy_order on commerce_refunds(order_id) where stripe_refund_id is not null;
alter table commerce_refunds add column square_payment_id text;
alter table commerce_refunds add column square_refund_id text unique;
alter table commerce_refunds add column request_key text unique;
alter table credit_uses add column reversed_at timestamptz;
alter table credit_uses add column restored_quantity integer not null default 0;
alter table credit_grants add column payment_id text;
create table square_payment_attempts (
 id text primary key, order_id text not null references commerce_orders(id), token_hash text not null,
 status text not null default 'pending', payment_id text, created_at timestamptz not null default now()
);
create unique index square_one_open_attempt on square_payment_attempts(order_id) where status in ('pending','unknown');
create table square_payments (
 id text primary key, order_id text not null references commerce_orders(id), invoice_id text,
 environment text not null, amount_cents integer not null check(amount_cents>0), refunded_cents integer not null default 0 check(refunded_cents>=0 and refunded_cents<=amount_cents),
 status text not null, receipt_url text, period_start timestamptz, period_end timestamptz, created_at timestamptz not null default now()
);
create table square_events (
 id text primary key, environment text not null, type text not null, object_id text not null,
 status text not null default 'pending', attempts integer not null default 0,
 received_at timestamptz not null default now(), processed_at timestamptz
);
create table payment_notifications (
 id text primary key, order_id text not null references commerce_orders(id), kind text not null,
 status text not null default 'pending', created_at timestamptz not null default now(), sent_at timestamptz
);
create table square_disputes (
 id text primary key, payment_id text not null, state text not null, amount_cents integer not null,
 due_at timestamptz, updated_at timestamptz not null default now()
);
create table commerce_policy (
 id text primary key, value jsonb not null, updated_by text not null, updated_at timestamptz not null default now()
);
-- Every new financial table is private to the server database role.
do $$ declare name text; begin
 foreach name in array array['square_payment_attempts','square_payments','square_events','payment_notifications','square_disputes','commerce_policy'] loop
  execute format('alter table %I enable row level security',name);
  execute format('revoke all on %I from public',name);
 end loop;
end $$;
create or replace function audit_summary(row_data jsonb) returns jsonb language sql immutable as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(row_data)
 where key in ('id','user_id','role','active','disabledAt','price','status','amount_cents','total_cents','split_pct','profit_split','gross_cents','transfer_id','coach_ids','coach_id','service_id','lane_ids','rev','revision','cancel_at_period_end','pause_requested_at','revoked_at','remaining','quantity','minutes','athlete_id','household_id','payment_id','order_id','refunded_cents','request_key','reason','scheduled_action','action_effective_date','state','updated_by','value')
$$;
do $$ declare name text; begin
 foreach name in array array['square_payments','square_disputes','commerce_policy','credit_uses'] loop
  execute format('create trigger audit_change after insert or update or delete on %I for each row execute function record_club_audit()',name);
 end loop;
end $$;
alter table commerce_orders add column square_fee_payment_id text unique;
alter table square_payments add column purpose text not null default 'base';

-- Correct future Elite Hybrid grants: Performance video + a distinct monthly film review.
update club_services set remote=1 where id='m3';
