-- Generated from migrations/0011_portal.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0011_portal.sql') THEN
alter table club_athletes add column profile jsonb not null default '{}';
alter table club_waivers add column details jsonb not null default '{}';
-- Defense in depth for all application/auth tables: no anonymous database grants.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table %I enable row level security',t.tablename);
  execute format('revoke all on %I from public',t.tablename);
 end loop;
end $$;

    INSERT INTO _migrations (name) VALUES ('0011_portal.sql');
  END IF;
END
$netlify_apply$;
