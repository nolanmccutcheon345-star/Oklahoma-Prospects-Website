-- Preserve previous supplier records and order history while adding Printify management.
alter table shop_products add column provider text not null default 'printful' check(provider in ('printful','printify'));
alter table shop_products add column provider_product_id text;
update shop_products set provider_product_id=id;
create unique index shop_provider_product on shop_products(provider,provider_product_id);
alter table shop_products add column archived boolean not null default false;
alter table shop_products add column pricing_mode text not null default 'fixed' check(pricing_mode in ('default','markup','margin','fixed'));
alter table shop_products add column pricing_bps integer not null default 9000 check(pricing_bps between 0 and 100000);
alter table shop_products add column manufacturing_hash text not null default '';
alter table shop_products add column gallery jsonb not null default '[]';
alter table shop_products add column image_approved boolean not null default true;
alter table shop_order_details add column provider text not null default 'printful' check(provider in ('printful','printify'));
alter table shop_order_details add column vendor_create_started_at timestamptz;
alter table shop_order_details add column vendor_shipping_cents integer;
create table shop_settings (
 id integer primary key check(id=1), default_markup_bps integer not null default 9000 check(default_markup_bps between 0 and 100000),
 revision integer not null default 1, updated_by text, updated_at timestamptz not null default now()
);
insert into shop_settings(id) values(1);
create table shop_images (
 id text primary key, product_id text not null references shop_products(id),
 png_base64 text not null check(length(png_base64)<=2800000), created_by text not null, created_at timestamptz not null default now()
);
create table shop_changes (
 id bigint generated always as identity primary key, product_id text, actor text not null,
 action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['shop_settings','shop_images','shop_changes'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on %I from public',t);
 end loop;
end $$;
