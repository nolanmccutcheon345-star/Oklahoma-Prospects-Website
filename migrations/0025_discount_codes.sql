-- Additive: historical orders retain their original prices and payment records.
create table discount_codes (
  id text primary key,
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  kind text not null check (kind in ('percentage','fixed')),
  value integer not null check (value > 0 and value <= 1000000 and (kind <> 'percentage' or value < 10000)),
  purchase_types text[] not null check (
    cardinality(purchase_types) between 1 and 4
    and array_position(purchase_types, null) is null
    and purchase_types <@ array['cage','assessment','lesson','package']::text[]
  ),
  starts_on date,
  ends_on date,
  active boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
alter table discount_codes enable row level security;
revoke all on discount_codes from public;
-- No seeded promotions. Only an authorized admin may create or activate a code.
