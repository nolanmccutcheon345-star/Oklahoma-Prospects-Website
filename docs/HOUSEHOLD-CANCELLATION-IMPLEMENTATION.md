# Household cancellation implementation — October 5 owner decisions

Base: production merge `e7f5515a3e8af1684f8e1fbc300183cda05d5ba2`. Claimed files: new `booking-change-policy` and `family-cancellation` server modules/tests, `square-management.server.ts`, `family-billing.tsx`, and this note. Existing bot branches and PRs #26/#27/#30 are preserved. No new migration, credentials, SDK, dependency, or hosting setting.

## Implemented slice

- Accepted parent booking cancellations consume one allowance per billing household, shared across parent logins and athletes, in the America/Chicago calendar month. Known family cancellations recorded earlier in that month also count.
- A first eligible cash cancellation at 48+ hours queues a full refund; 24 to under 48 hours queues 50%; under 24 hours queues none. Later parent cancellations remain available with zero refund.
- A unique monthly record in the existing server-only `commerce_policy` table serializes the allowance. The same database transaction validates locked ownership, changes the booking, releases occupancy, restores eligible credits, and writes the refund record. A failed transaction rolls everything back. Duplicate requests retain the original refund and allowance.
- Refund amounts are recalculated after locks at confirmation time. The earlier preview cannot preserve a larger refund after a time cutoff.
- Cash refunds continue through the existing Square idempotency and reconciliation path. Pending, failed and completed provider statuses are distinct in the family notice; accepting a cancellation is not a claim that money has returned.
- Player logins are rejected server-side for these billing actions. This is not a claim that the entire player permission matrix is complete.
- The shared helper supports both cancellation and reschedule event kinds. Only cancellation is connected to the public API in this slice.

## Not complete / release gates

- Rescheduling and its change-fee collection are not yet built. They must use the same household helper; do not implement another counter.
- Coach-initiated private cancellations and facility closures need separate actor-authorized workflows and the family's refund/reschedule choice. They must not consume the parent allowance. No arbitrary initiator is accepted from the family request body. The existing parent API is not a coach-cancellation endpoint.
- Team-coach credit forfeiture remains a separate team rule, not this household counter.
- October 6 clarification implemented: a qualifying 24–48-hour membership lesson cancellation queues a cash refund of half that individual lesson’s prepaid value to its original funding payment/card. Actual base payment divided by original lesson grant quantity supplies the value, including actual discounts and excluding separate setup fees. Renewal funding is retained. The consumed credit is not restored. Missing/ambiguous funding, split-payment invoices, rollover credits without funding provenance or insufficient refundable balance require review without mutating the booking/allowance. Full eligible credit restoration preserves expiry; later cancellations forfeit credit. Historical processor review remains intact.
- Family notice/render and authenticated preview API verification remain pending. No hosted account, booking, refund, payment, email or customer message was created during implementation. Run hosted mutations only after runtime DB/payment/email isolation is verified.
- This draft is a focused prerequisite, not completion of all R6/N2/N3/W8 requirements. Production publishing is authorized by Nolan; the former publish lock is not reinstated. Financial acceptance gaps above must be resolved before releasing this slice.

## Validation

The real transaction is tested using all repository SQL migrations in isolated PGlite. Tests cover household sharing, concurrency, idempotent refunds, exact 48/24-hour boundaries, wrong household/player denial, credit restoration/forfeiture, and rollback on missing funding or insufficient refundable balances, individual membership lesson valuation, renewal-card selection, setup exclusion, discounted payment values, single rounding, and no cash-plus-credit duplication. Policy tests cover Chicago month resets including daylight saving offsets, retries, rollback, and known earlier cancellations. Existing commerce pricing and Square refund ordering regressions are also checked. Build/type/lint and exact commit evidence belong in the PR.
