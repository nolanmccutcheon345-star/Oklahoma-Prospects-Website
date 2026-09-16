-- Generated from migrations/0007_authority.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0007_authority.sql') THEN
-- Optimistic concurrency for existing shared records. No customer payload rewrites.
alter table pd_working_file add column if not exists revision integer not null default 0;
alter table reservations alter column status set default 'unconfirmed';

-- No browser/public database principal may read personal records directly.
-- The private server connection performs verified-user authorization in each handler.
do $$ declare record_table text;
begin
  foreach record_table in array array['profiles','reservations','programs','drills','athlete_logs','pd_working_file','club_state','club_audit'] loop
    if to_regclass(record_table) is not null then
      execute format('alter table %I enable row level security', record_table);
      execute format('revoke all on %I from public', record_table);
    end if;
  end loop;
end $$;

    INSERT INTO _migrations (name) VALUES ('0007_authority.sql');
  END IF;
END
$netlify_apply$;
