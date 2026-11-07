-- Generated from migrations/0116_notice_release_controls.sql; do not edit this copy.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
DO $netlify_apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _migrations WHERE name = '0116_notice_release_controls.sql') THEN
-- No existing or future message is approved by deployment. Existing outboxes stay intact.
CREATE TABLE notice_release_approvals (
 queue text NOT NULL CHECK(queue IN ('invitation','fee','tryout','center','program','team')),
 source_id text NOT NULL, digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 owner_id text NOT NULL REFERENCES "user"(id), approved boolean NOT NULL DEFAULT false,
 approved_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(queue,source_id)
);
CREATE TABLE notice_release_audit (
 id bigserial PRIMARY KEY, queue text NOT NULL, source_id text NOT NULL,
 digest text NOT NULL, actor_id text NOT NULL REFERENCES "user"(id),
 action text NOT NULL CHECK(action IN ('approve','hold','dispatch')),
 reason text NOT NULL DEFAULT '', recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notice_release_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_release_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notice_release_approvals,notice_release_audit FROM public;
CREATE TRIGGER notice_release_audit_append_only BEFORE UPDATE OR DELETE ON notice_release_audit FOR EACH ROW EXECUTE FUNCTION protect_finance_history();
CREATE TRIGGER notice_release_audit_no_truncate BEFORE TRUNCATE ON notice_release_audit FOR EACH STATEMENT EXECUTE FUNCTION protect_finance_history();

    INSERT INTO _migrations (name) VALUES ('0116_notice_release_controls.sql');
  END IF;
END
$netlify_apply$;
