-- Unpriced operational drafts and availability only. No commercial product backfill.
create table operational_service_catalog (
 id text primary key,
 kind text not null check(kind in ('lesson','package','membership','cage','cage_plan','fee','team_plan')),
 name text not null check(length(name) between 1 and 120),
 discipline text not null default '',
 purpose text not null default '',
 detail text not null default '',
 featured boolean not null default false,
 sort_order integer not null default 0 check(sort_order between 0 and 10000),
 adopted boolean not null default false,
 status text not null check(status in ('draft','active','archived')),
 revision integer not null check(revision>0),
 created_by text not null references "user"(id),
 updated_by text not null references "user"(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table operational_service_catalog enable row level security;
revoke all on operational_service_catalog from public;
