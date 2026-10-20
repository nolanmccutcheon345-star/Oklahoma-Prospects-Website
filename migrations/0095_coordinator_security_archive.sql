create table coordinator_archive_batches (
 seq bigint generated always as identity unique, id uuid primary key,coordinator_through bigint not null,staff_through bigint not null,
 digest text not null unique,previous_digest text not null,bucket text not null,region text not null,object_key text not null,
 retain_until timestamptz not null,payload jsonb not null,created_at timestamptz not null default now()
);
create table coordinator_archive_receipts (
 batch_id uuid primary key references coordinator_archive_batches(id),version_id text not null,mode text not null check(mode='COMPLIANCE'),
 retain_until timestamptz not null,digest text not null,verified_at timestamptz not null default now()
);
alter table coordinator_archive_batches enable row level security;
alter table coordinator_archive_receipts enable row level security;
revoke all on coordinator_archive_batches,coordinator_archive_receipts from public;
create trigger immutable_archive_batch before update or delete on coordinator_archive_batches for each row execute function protect_club_audit();
create trigger immutable_archive_batch_truncate before truncate on coordinator_archive_batches for each statement execute function protect_club_audit();
create trigger immutable_archive_receipt before update or delete on coordinator_archive_receipts for each row execute function protect_club_audit();
create trigger immutable_archive_receipt_truncate before truncate on coordinator_archive_receipts for each statement execute function protect_club_audit();
-- No retention periods or approvals are assigned by this migration.
create table coordinator_privacy_policies (
 category text primary key check(category in ('recruiting','communications','operational','publication','audit')),
 purpose text not null,retention_days integer not null check(retention_days between 1 and 3650),
 legal_basis text not null,revision integer not null,reviewer_id text not null references "user"(id),updated_at timestamptz not null default now()
);
create table coordinator_privacy_reviews (
 id uuid primary key,actor_id text not null references "user"(id),category text not null,revision integer not null,
 evidence text not null,outcome text not null check(outcome in ('policy','retention-review','privacy-flow-review')),created_at timestamptz not null default now()
);
alter table coordinator_privacy_policies enable row level security;
alter table coordinator_privacy_reviews enable row level security;
revoke all on coordinator_privacy_policies,coordinator_privacy_reviews from public;
create trigger immutable_privacy_review before update or delete on coordinator_privacy_reviews for each row execute function protect_club_audit();
create trigger immutable_privacy_review_truncate before truncate on coordinator_privacy_reviews for each statement execute function protect_club_audit();

-- Membership, not an identity high-water mark, prevents missing late commits with earlier IDs.
create table coordinator_archive_members (
 stream text not null check(stream in ('coordinator','staff')),event_id bigint not null,batch_id uuid not null references coordinator_archive_batches(id),primary key(stream,event_id)
);
alter table coordinator_archive_members enable row level security;
revoke all on coordinator_archive_members from public;
create trigger immutable_archive_member before update or delete on coordinator_archive_members for each row execute function protect_club_audit();
create trigger immutable_archive_member_truncate before truncate on coordinator_archive_members for each statement execute function protect_club_audit();
