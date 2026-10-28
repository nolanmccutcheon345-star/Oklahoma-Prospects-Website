-- Generated from migrations/0096_coordinator_provider_backup_reviews.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0096_coordinator_provider_backup_reviews.sql') THEN
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

    INSERT INTO _migrations (name) VALUES ('0096_coordinator_provider_backup_reviews.sql');
  END IF;
END
$netlify_apply$;
