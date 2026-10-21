-- Provider backups are administered outside the app. Reviews are owner attestations,
-- not an automatic backup/restore certificate. Preserve all historical archive rows.
create table coordinator_backup_reviews (
 id uuid primary key, actor_id text not null references "user"(id),
 reference text not null check(length(reference) between 8 and 200),
 snapshot_at timestamptz not null, expires_at timestamptz not null,
 recovery_evidence text not null default '' check(length(recovery_evidence)<=1000),
 reviewed_at timestamptz not null default now(),
 check(expires_at>snapshot_at),check(snapshot_at<=reviewed_at)
);
alter table coordinator_backup_reviews enable row level security;
revoke all on coordinator_backup_reviews from public;
create trigger immutable_backup_review before update or delete on coordinator_backup_reviews for each row execute function protect_club_audit();
create trigger immutable_backup_review_truncate before truncate on coordinator_backup_reviews for each statement execute function protect_club_audit();
