-- Generated from migrations/0067_organization_operations.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0067_organization_operations.sql') THEN
-- Separate operational access, never an owner/admin role. Intentionally no grants seeded.
create table organization_operational_access (
 user_id text primary key references "user"(id),
 status text not null default 'suspended' check(status in ('active','suspended','removed')),
 financial_restricted boolean not null default true check(financial_restricted),
 revision integer not null default 1,
 updated_by text not null references "user"(id),
 updated_at timestamptz not null default now()
);
alter table organization_operational_access enable row level security;
revoke all on organization_operational_access from public;

    INSERT INTO _migrations (name) VALUES ('0067_organization_operations.sql');
  END IF;
END
$netlify_apply$;
