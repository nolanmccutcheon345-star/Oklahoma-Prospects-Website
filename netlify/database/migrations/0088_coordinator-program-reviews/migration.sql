-- Generated from migrations/0088_coordinator_program_reviews.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0088_coordinator_program_reviews.sql') THEN
-- Owner-reviewed publication and schedule changes. No access is assigned.
alter table coordinator_approvals drop constraint coordinator_approvals_kind_check;
alter table coordinator_approvals add constraint coordinator_approvals_kind_check check(kind in ('transfer','cancel-event','content','tryout-change','program-change'));

    INSERT INTO _migrations (name) VALUES ('0088_coordinator_program_reviews.sql');
  END IF;
END
$netlify_apply$;
