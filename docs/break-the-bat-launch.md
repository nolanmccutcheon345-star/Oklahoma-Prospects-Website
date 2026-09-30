# Break the Bat promotion

Owner-authorized offer: 10% off one cage rental OR one private lesson, one use per customer; no stacking.

## Publish sequence

1. Deploy this tested checkout change to the existing `oklahoma-prospects` Netlify project. Production is publishing-locked; a GitHub merge alone does not publish it. Verify the deployed source revision.
2. In Front office → Discount codes, create `BREAKTHEBAT10` with percentage 10, purchase types Cage and fielding rentals + Private lessons, active true. No expiry has been requested. The server further restricts this campaign to one cage lane (not the combined fielding area) or one scheduled non-assessment lesson; packages, memberships, assessments and remote-only products are rejected. Existing assessment requirements remain.
3. Verify the active code in an authenticated production quote without submitting a real charge. Confirm production contains `lockBreakTheBatCustomer` before activating. Existing automated SQL/payment tests cover reuse and declines without real charges.
4. Change the separate comic Site from coach preview to live: remove preview badge/inactive notice, enable copy code and links to `/book` and `/lessons`, and publish it publicly. Post only after checkout deployment and code activation are verified.

## Enforcement

- Code-specific fixed 10% terms live in `break-the-bat.ts`; other existing codes are unchanged.
- The quote checks trusted signed-in account identity. The payment path repeats the check under transaction-scoped advisory locks for both account ID and normalized verified account email, then inserts the durable payment attempt in the same transaction.
- An existing pending/unknown/completed payment or recorded payment prevents another order using the offer. Same-order idempotent retries remain supported. Definite declines do not consume eligibility; unknown outcomes remain blocked until reconciled. Refunds do not automatically restore the offer.
- Square sandbox and production are isolated. The customer limit is enforced by verified account/email, not a browser cookie; it cannot establish that multiple separate verified accounts belong to the same physical person.
- No migration, live data write, payment, or campaign activation is performed by this source change.

## Validation

Targeted migrated-SQL discount tests, campaign eligibility and reuse tests, TypeScript and the Netlify preview build. Full repository tests are also run before handoff; see PR validation notes for results.
