-- Generated from migrations/0101_membership_presentation_homepage.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0101_membership_presentation_homepage.sql') THEN
-- Additive presentation/content only. No price, order, grant, or agreement rewrites.
alter table club_services add column if not exists presentation jsonb not null default '{}'::jsonb;
alter table club_services add column if not exists presentation_revision integer not null default 0;

create table if not exists website_homepage (
  id text primary key check (id='home'),
  featured_coach_ids text[] not null default '{}',
  revision integer not null default 0,
  updated_by text,
  updated_at timestamptz not null default now(),
  check (cardinality(featured_coach_ids)<=3)
);
insert into website_homepage(id) values('home') on conflict do nothing;

create table if not exists website_testimonials (
  id uuid primary key,
  quote text not null,
  attribution text not null,
  team_affiliation text not null default '',
  status text not null default 'draft' check(status in ('draft','published','archived')),
  consent_confirmed boolean not null default false,
  consent_note text not null default '',
  consent_by text,
  consent_at timestamptz,
  sort_order integer not null default 0,
  revision integer not null default 1,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  check(status<>'published' or (consent_confirmed and consent_by is not null and consent_at is not null))
);
create table if not exists website_content_audit (
  id uuid primary key,
  actor_id text not null,
  entity text not null,
  target_id text not null,
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists website_content_audit_recent on website_content_audit(created_at desc);

alter table website_homepage enable row level security;
alter table website_testimonials enable row level security;
alter table website_content_audit enable row level security;
revoke all on website_homepage,website_testimonials,website_content_audit from public;

    INSERT INTO _migrations (name) VALUES ('0101_membership_presentation_homepage.sql');
  END IF;
END
$netlify_apply$;
