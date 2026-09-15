alter table club_athletes add column profile jsonb not null default '{}';
alter table club_waivers add column details jsonb not null default '{}';
-- Defense in depth for all application/auth tables: no anonymous database grants.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('alter table %I enable row level security',t.tablename);
  execute format('revoke all on %I from public',t.tablename);
 end loop;
end $$;
