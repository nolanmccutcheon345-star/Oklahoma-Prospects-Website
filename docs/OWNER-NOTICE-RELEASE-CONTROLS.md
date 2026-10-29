# Owner-controlled notification release

## Purpose and rollout

Owner authorization on October 29, 2026 covers separate mail controls, preserving the old backlog and releasing the ten current 13U fee notices after review. It does not authorize blanket backlog or future-message delivery.

The additive release ledger leaves existing outbox records and historical audit records intact. Deployment does not approve any messages. The existing shared scheduled worker remains disabled during rollout. No credentials, account grants, membership obligations or payment settings change.

## Owner workflow

Front Office → Teams & Players → **Owner email controls — review, approve and send**:

1. Load the audit. Counts cover all categories; message details are paginated.
2. Choose a category and inspect exact recipients, content, revision and attempts.
3. Select and explicitly approve only the reviewed versions (up to 20).
4. Select the approved messages and send at most two per batch. Check each result before continuing.
5. Refresh the source delivery status. A queued operation or attempt is not proof of sending. Provider acceptance is not proof of inbox delivery.

Unapproved old messages and newly generated follow-ups remain held. New messages require the same explicit owner review; this is not an automatic recurring-send approval. Holding a message preserves history and cannot recall a provider request already submitted. Recipient/content changes invalidate approval. Existing current authority, household, sender and eligibility checks remain mandatory.

Five categories are email: invitations, fee notices, group tryouts, registration-center notices and program notices. Team notices are in-app posts. Existing explicitly confirmed immediate team chat retains its separate permission-checked behavior; it must not release scheduled backlog.

## Verification boundaries

Use only disposable synthetic fixtures for automated send tests. Assert no provider requests for unapproved, unrelated, changed or revoked messages; retain leases and provider idempotency on retries. Verify owner-only audit/approval/dispatch, truthful counts, pagination and separate acceptance/delivery labels. Run required typecheck/build/SSR, regression and browser gates before authorized deployment. Verify exact production release and inspect current notices again before release. Never claim inbox delivery from a queue state or successful build.
