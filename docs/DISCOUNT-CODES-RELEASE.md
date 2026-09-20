# Admin discount codes — September 20, 2026

Replaces the September 19 after-school promotion (main 1d9d3658bea3e35b382f34d3593daaeab382a7a2). The prior offer is removed from booking and checkout copy, eligibility controls, links, and both client and server price calculations.

Owners use Front office → Discount codes to create/edit percentage or dollar-amount discounts, select cage/fielding rentals, assessments, private lessons, and/or lesson packages, set optional inclusive Central-time dates, and activate/deactivate codes. Codes start inactive. No promotional codes are seeded. One code is permitted per one-time purchase; recurring memberships, cage passes and setup fees are excluded. A positive balance must remain, preserving payment-required bookings. Eligibility never opens an unavailable product or bypasses an assessment requirement.

Checkout previews and saves server-derived cents and code version. Unknown, inactive, scheduled, expired, ineligible or changed codes cannot begin a new payment. Editing the basket invalidates the reviewed discount. The saved quote is rechecked under a database lock before a new Square payment attempt; an already-started attempt keeps its original amount and idempotency key. Old promotion snapshots reject new attempts. Historical paid orders, refunds and in-flight payments retain their original amounts. Booking occupancy and fulfillment still require provider-confirmed payment.

## Validation

- 500 automated tests pass, including real migrated embedded PostgreSQL coverage of role access, eligibility, dates, edits, stale versions, monetary rounding, paid booking fulfillment, duplicate confirmations and refund amounts.
- Real checkout/admin components rendered in JSDOM with synthetic auth/network boundaries: create/edit/toggle eligibility, apply/remove invalid codes, delayed responses, basket changes, and discounted payment amount.
- TypeScript, Netlify branch-deploy build and built server response/CSP checks pass.
- Fixed three pre-existing stale test assumptions: current $289 Development first month, a fixed seed's scheduling clock, and alert installation versus later pricing changes.
- These are offline integration/component checks, not a provider-backed Square Sandbox transaction or a full hosted browser acceptance run.

## Deployment and remaining acceptance

Apply migration 0025 through the standard Netlify migration flow. Include generated migrations 0024 and 0025; 0024 is guarded against reapplication. The current live site was inspected and still shows the old offer. Nothing in these local checks establishes publication.

The Netlify CLI session is currently signed out. The existing square-release-check preview is owner-authenticated but displays Square as unconfigured. Rebuild/deploy this source with CONTEXT=branch-deploy to that isolated preview, verify migration 0025, and then test a disposable percentage and fixed cage discount through actual Square Sandbox. Verify admin create/edit/deactivate, ineligible/expired rejection, no booking before payment, exactly one confirmed booking after payment, and refund/cancel the disposable test through the normal owner controls. Keep test codes inactive afterward. Use a production-context build for live publication only after hosted acceptance; retain the live cage-only enrollment gate and release lock.
