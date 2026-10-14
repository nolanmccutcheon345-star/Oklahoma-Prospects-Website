-- Additive merchandise domain, linked to the existing Square commerce ledger.
create table shop_products (
 id text primary key, title text not null, description text not null default '',
 category text not null default 'Apparel', image_url text not null, size_guide text not null default '',
 team_label text not null default '', tax_code text not null default '',
 variants jsonb not null, published boolean not null default false,
 sample_approved boolean not null default false, revision integer not null default 1,
 updated_by text not null, updated_at timestamptz not null default now()
);
create table shop_order_details (
 order_id text primary key references commerce_orders(id), user_id text not null,
 request_hash text not null, vendor_body jsonb not null, vendor_cap_cents integer not null check(vendor_cap_cents>=0),
 product_revisions jsonb not null, tax_evidence jsonb not null,
 status text not null default 'awaiting-payment', provider_id text unique,
 shipments jsonb not null default '[]', attempts integer not null default 0,
 lease_token text, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 last_error text, updated_at timestamptz not null default now()
);
create index shop_queue on shop_order_details(status,next_attempt_at);
do $$ declare t text; begin
 foreach t in array array['shop_products','shop_order_details'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public',t);
 end loop;
end $$;
