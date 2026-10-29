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
