# Enrollment launch readiness

The email and team-collection schedulers previously checked the build-only `CONTEXT` variable at function runtime. Netlify does not guarantee that variable there. They now use the platform-provided `context.deploy.context` and `context.deploy.published`. The authenticated SSR worker endpoints continue to require the build-pinned production context, canonical origin and worker secret; an explicitly nonproduction runtime context still rejects the request. Missing optional runtime metadata no longer blocks a verified production build.

Owner email status now lists the precise missing configuration conditions without exposing values or credentials. The collection panel distinguishes sandbox settings in the current deployment from separately isolated sandbox configuration; it continues to require recorded provider acceptance and the collection enable switch. No flag, test fixture or status screen records consent or proves a provider payment.

Tests cover published-production dispatch without a runtime CONTEXT variable, rejection of previews and unpublished deployments, operational pause switches, and diagnostics without secret disclosure. Existing fee, agreement, family access and payment regressions remain required before release.

Activation remains separate: publish owner-reviewed team policies and fee explanations; perform separately authorized Square Sandbox primary/backup/failure/retry/reconciliation tests and controlled email verification; then record truthful acceptance evidence and enable the corresponding production workers. Review pending notification queues before enabling a shared worker. Do not send historical notices or initiate live charges as a test.
