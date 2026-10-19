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
