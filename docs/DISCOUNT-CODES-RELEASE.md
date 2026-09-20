# Admin discount codes — September 20, 2026

Replaces the September 19 after-school promotion (main 1d9d3658bea3e35b382f34d3593daaeab382a7a2). The prior offer is removed from booking and checkout copy, eligibility controls, links, and both client and server price calculations.

Owners use Front office → Discount codes to create/edit percentage or dollar-amount discounts, select cage/fielding rentals, assessments, private lessons, and/or lesson packages, set optional inclusive Central-time dates, and activate/deactivate codes. Codes start inactive. No promotional codes are seeded. One code is permitted per one-time purchase; recurring memberships, cage passes and setup fees are excluded. A positive balance must remain, preserving payment-required bookings. Eligibility never opens an unavailable product or bypasses an assessment requirement.

Checkout previews and saves server-derived cents and code version. Unknown, inactive, scheduled, expired, ineligible or changed codes cannot begin a new payment. Editing the basket invalidates the reviewed discount. The saved quote is rechecked under a database lock before a new Square payment attempt; an already-started attempt keeps its original amount and idempotency key. Old promotion snapshots reject new attempts. Historical paid orders, refunds and in-flight payments retain their original amounts. Booking occupancy and fulfillment still require provider-confirmed payment.

## Validation

- 500 automated tests pass, including real migrated embedded PostgreSQL coverage of role access, eligibility, dates, edits, stale versions, monetary rounding, paid booking fulfillment, duplicate confirmations and refund amounts.
- Real checkout/admin components rendered in JSDOM with synthetic auth/network boundaries: create/edit/toggle eligibility, apply/remove invalid codes, delayed responses, basket changes, and discounted payment amount.
- TypeScript, Netlify branch-deploy build and built server response/CSP checks pass.
- Fixed three pre-existing stale test assumptions: current $289 Development first month, a fixed seed's scheduling clock, and alert installation versus later pricing changes.
- GitHub Actions run 35489951332 independently passed the clean install, typecheck, tests, lint, audit, Netlify build and SSR checks on implementation commit d15709a4f090f44025ecf551f32b4d3aeae41ddc.

## Hosted Sandbox acceptance

Preview: https://square-release-check--oklahoma-prospects.netlify.app

Netlify deploy 6aaf68a3321b9f8d0f5b09fb completed with the branch-scoped environment and standard database setup, including migration 0025. Owner controls loaded and saved codes successfully. The booking page no longer advertises or calculates the old special. Hosted HTTP smoke passed public pages, security headers, per-response nonces, private caching, anonymous session behavior, redirects and 404 behavior. Desktop secure checkout was visually inspected. The installed Lighthouse plugin could not load its local scan target (ERR_EMPTY_RESPONSE), so no Lighthouse/performance result is claimed.

- Created QA-0920-PERCENT, active, 10%, cage-only. A $25 half-hour cage quote became $22.50. No confirmed booking existed before payment. Square Sandbox payment jt4XTJ5ffRkZoDHQ8vXIggfioVeZY confirmed $22.50; family and office each showed one confirmed visit and matching paid amount.
- Created QA-0920-FIXED, active, $5, lesson-package-only. Cage checkout rejected it and disabled continuing. Edited eligibility to cages; the same $25 purchase then quoted $20. Deactivated after preview; attempting to continue was rejected by the server. Reactivated and reapplied the current version; Square Sandbox payment 1YRfTOxsnbSbvuHzRTxyAdNUNsLZY confirmed $20, with one new confirmed visit.
- Cancelled both disposable September 28 cage bookings through the normal family cancellation/refund flow. Refund previews used the discounted paid totals, $22.50 and $20. Office subsequently showed both payments fully refunded and no confirmed visits in the next two weeks. Both test codes are inactive. Existing historical test purchases were left unchanged.
- Expired/scheduled dates, cross-role authorization, duplicate confirmations and additional purchase types are covered by the automated migrated-database tests; no live enrollment gate was opened to test unavailable products.

## Publication status

PR #13 remains the reviewable release: https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/pull/13 . Production remains unchanged and still has the old special until publication. Automatic approval review previously rejected merging before hosted acceptance; obtain explicit approval for merging and publishing this reviewed release.

Netlify production deploy 6aae4ae80ac5213cadaff262 remains locked. Site build settings still point at the former hgit repository with builds stopped; merging GitHub alone does not establish a live deployment. After release approval, build with CONTEXT=production, use the standard additive database migrations, publish the reviewed source, verify the live booking and admin paths, and restore the release lock. Preserve the cage-only checkout gate. Do not promote the Sandbox artifact into production.
