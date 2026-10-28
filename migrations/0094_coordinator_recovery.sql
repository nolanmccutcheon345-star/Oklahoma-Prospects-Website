-- Receipts prevent repeating an owner-reviewed recovery; history remains append-only.
create table coordinator_recoveries (
 audit_id bigint primary key references coordinator_audit(id),actor_id text not null references "user"(id),
 source_digest text not null,reason text not null,created_at timestamptz not null default now()
);
alter table coordinator_recoveries enable row level security;
revoke all on coordinator_recoveries from public;
create trigger immutable_coordinator_recovery before update or delete on coordinator_recoveries for each row execute function protect_club_audit();
create trigger immutable_coordinator_recovery_truncate before truncate on coordinator_recoveries for each statement execute function protect_club_audit();
