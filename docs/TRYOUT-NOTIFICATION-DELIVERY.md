# Tryout notification delivery continuation

Stacked after PR40 automatic enrollment. This adds a scheduled sender for the transactional tryout outbox; it does not enable customer messaging or apply hosted migrations.

## Behavior

Enrollment, changed-event and cancellation notices use their saved event revision and recipient snapshot. A committed two-minute lease prevents simultaneous claims. Each provider attempt rechecks the event/enrollment status; superseded notices are not newly sent. An already in-flight provider call cannot be recalled, so a subsequent event edit queues an updated notice.

Provider requests retain an immutable body and stable notice-specific idempotency key. Retries back off, stopping for owner review after eight attempts or 23 hours from the first attempt. Resend documents 24-hour key retention: https://resend.com/changelog/idempotency-keys. The earlier cutoff prevents automatically retrying beyond that retention period. `sent` means provider accepted the email, not confirmed inbox delivery. Review items require investigation before any manual resend.

The authenticated production endpoint processes up to two attempts per invocation; a minute schedule drains the queue. No recipient or provider-error content is logged. Existing admin notification status includes pending, processing, sent, superseded and review.

## Activation requirements

Apply migrations 0032–0034 only after reviewed deployment and migration acceptance. Verify role permissions and outbox persistence on an isolated database. Run provider tests with controlled inboxes, including an ambiguous timeout/retry and event cancellation.

Names only: `TRYOUT_NOTIFICATIONS_ENABLED` defaults off; `TRYOUT_NOTIFICATIONS_SECRET` authenticates the scheduled endpoint; `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configure the provider; `TRYOUT_EMAIL_TEST_RECIPIENTS` allows exact controlled addresses for direct isolated preview tests. The scheduler and HTTP delivery endpoint require production context and canonical host. Unknown contexts fail closed. Preview builds cannot promote themselves to production through runtime variables.

No hosting variables were changed and no family messages were sent while implementing this branch. Do not infer activation from a successful build. Full GitHub CI must run after the stacked prerequisites are integrated/retargeted to main.
