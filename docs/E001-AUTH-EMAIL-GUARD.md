# E-001 — authentication email context guard

Verification and password-reset delivery now checks deploy context before contacting Resend. Production remains enabled; other known contexts deny delivery unless the recipient is explicitly listed in server-only `AUTH_EMAIL_TEST_RECIPIENTS` (comma-separated exact addresses). This setting does not allow wildcards or entire domains. Leave it unset to block all preview mail.

The existing `SQUARE_DEPLOY_CONTEXT` build constant, pinned by Vite, is also used for authentication email. A conflicting runtime `CONTEXT` cannot elevate a preview bundle to production. Missing, empty or unknown context fails closed. Configure test recipients only to inboxes the tester controls; never copy credentials or verification links into reports.

This branch changes no environment variables, production settings, customer data, authentication requirement or payment behavior. It does not establish database/webhook isolation: E-003 still needs exact preview-runtime proof before mutating hosted tests. No real email delivery is exercised by the offline regression tests.

Audit ID: E-001. Base: main `ec06d2313e8d31447e676a10e6b69ada1e101c9e`. Claimed files: `src/lib/auth/email.server.ts`, `src/lib/auth/email.test.ts`, this note. PR #26 and PR #27 files remain untouched. Production publishing stays locked. A5 reviews the guard; A4 verifies signup/reset with controlled recipients only after environment gates pass.
