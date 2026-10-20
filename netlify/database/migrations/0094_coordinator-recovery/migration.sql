-- Generated from migrations/0094_coordinator_recovery.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0094_coordinator_recovery.sql') THEN
-- Receipts prevent repeating an owner-reviewed recovery; history remains append-only.
create table coordinator_recoveries (
 audit_id bigint primary key references coordinator_audit(id),actor_id text not null references "user"(id),
 source_digest text not null,reason text not null,created_at timestamptz not null default now()
);
alter table coordinator_recoveries enable row level security;
revoke all on coordinator_recoveries from public;
create trigger immutable_coordinator_recovery before update or delete on coordinator_recoveries for each row execute function protect_club_audit();
create trigger immutable_coordinator_recovery_truncate before truncate on coordinator_recoveries for each statement execute function protect_club_audit();

    INSERT INTO _migrations (name) VALUES ('0094_coordinator_recovery.sql');
  END IF;
END
$netlify_apply$;
