# PR #16 production and payment audit — September 22, 2026

## Release identity

- Repository: `nolanmccutcheon345-star/Oklahoma-Prospects-Website`.
- PR #16 merged into `main` at `2026-09-22T01:28:05Z` as `eaca119248d8868bb7b96c7a5e3dbe26b287275b`.
- GitHub compare returned `identical`, zero commits ahead/behind, between that merge and current `main`.
- Netlify's current production deploy is `6ab1da4669caf41bd2064ba6`, published `2026-09-22T01:31:39.827Z`, ready and locked, titled `PR16 eaca119 Prospects player fundraising`.
- This was a CLI deploy and Netlify reports `commit_ref: null`. The title and observed live behavior support the release match; they are not a cryptographic comparison of the deployed server bundle with GitHub.

PR #16 added 45 changed files, including parent and owner fundraising views, public approved player pages, Square hosted checkout, a separate PostgreSQL fundraising ledger, private receipts/export, reconciliation, and migration 0027. It replaced the Square route entrypoint with a wrapper around the existing commerce webhook and added the Visit-page fundraising link.

## Checks performed on production

| Check | Result |
| --- | --- |
| Visit → Player fundraising | Link points to `/fundraising` and opens the live app. |
| Public dashboard | HTTP 200; one approved active fundraiser, $0 confirmed, no public donor records; `paymentReady: true`. |
| Player page | Loads matching player and goal; sponsorship amount selection updates the button. |
| Share dialog | Produces the matching website player URL and email text; no messages sent. |
| Example page | Clearly marked as an example; payment button disabled. |
| Existing authenticated session | My fundraising and owner Front office views load. No player records or approvals changed. |
| Guest access | Requests without cookies to private `my`, `office`, and CSV export return HTTP 401. |
| Existing sponsorship | Owner view shows one $50 unconfirmed entry, excluded from raised total. Invoking Check Square did not turn it into a confirmed sponsorship. This audit does not establish why that checkout is unpaid. |
| Invalid checkout origin | HTTP 403 before checkout. |
| Invalid amount | One-cent request returns HTTP 400 and states the $5–$10,000 range. |
| Missing receipt reference | HTTP 404. |
| Unsigned Square webhook | HTTP 403, `Invalid signature`. |
| Cage booking | Lane availability loads and selecting a lane/time reaches `/pay` with the $52.50 one-hour review and optional discount field. Stopped before Continue to payment. |

No real payment, refund, booking, new fundraiser, or sponsorship checkout was created. The browser already had an authenticated owner session; this is not a new-login acceptance test. The guest checks used separate requests without that session.

## Findings and proposed fixes

### 1. Checkout readiness omits the ledger switch

`paymentReady()` checks the payments switch and production sandbox acceptance, but not `FUNDRAISING_LEDGER_ENABLED`. The webhook wrapper skips fundraising updates when that switch is off. A misconfiguration could therefore open checkout while automatic attribution is disabled. This is a confirmed configuration-dependent defect, not evidence that production's ledger switch is currently off.

**Fix:** require the ledger switch alongside the existing readiness conditions. Test the actual checkout handler with each missing/false switch and confirm it rejects before provider or database work. This follows the three-switch release contract already documented in `fundraising-release.md`.

### 2. An unsuccessful attempt can block later successful attribution

`syncPayment()` records a payment ID even for failed/pending attempts, then allows updates only from that same ID. A later completed payment with a different ID for the same verified order is silently excluded. Receipt/office recovery also follows the first recorded payment instead of checking the order for a later successful tender.

**Fix:** allow a different verified payment ID until the contribution is completed. Once completed, preserve attribution to its winning payment. For contributions not yet completed, also inspect the verified order's tenders during recovery. Regression coverage exercises failed → successful attempts, stale failed events, competing payment IDs, duplicate delivery, full refunds, stale refund responses, and recovery when the successful webhook was missed. This reproduces the code-state problem with isolated provider fixtures; it does not assert this occurred to the existing live entry.

### 3. Old unpaid or failing checkouts can starve reconciliation

The owner batch chooses the oldest 50 rows by `COALESCE(checked,created)`. Unpaid orders with no tender and provider failures do not advance `checked`, so repeated batches can select the same old rows forever while newer payments remain unexamined.

**Fix:** record each attempt before contacting Square, retaining oldest-first ordering with a deterministic ID tie-breaker. Unpaid/failed attempts remain eligible for later checking but rotate behind untouched rows. An isolated PostgreSQL test with 50 old entries and a 51st newer entry proves the second batch reaches the newer one. Attempt timestamps do not change payment status or totals.

## Verification and limits

- Original release evidence in `fundraising-release.md` reports 506 passing tests and a $5 Square sandbox payment, signed webhook delivery, duplicate handling and full refund. Those are prior release results, not new live-money results from this audit.
- The initial audit full-suite run passed 507 of 508 tests. The unrelated signed-out redirect wrapper failed around its 10-second subprocess limit under concurrent test/build load; its isolated rerun passed. No authentication code was changed.
- New targeted tests exercise the actual fundraising checkout, reconciliation and payment synchronization functions against offline fixtures and embedded PostgreSQL.
- Final-branch TypeScript, Netlify production build and generated-server SSR checks all passed. The three new targeted regression tests passed on the final source. The four pre-existing fundraising tests passed in the earlier targeted and full-suite runs.
- The shared commerce fulfillment, signature verification, booking tables and booking prices are not changed by these fixes. Existing commerce tests cover payment idempotency, booking conflicts, discounted payments and refund ordering.
- No production Square transaction or real Square-delivered production webhook was exercised. Runtime ledger-switch configuration was not directly read. Consequently this audit verifies the deployed fundraising surface and several live safeguards, but does not certify a complete real-money donation/refund cycle.
- Hosted validation of the proposed fixes and review of the production ledger switch remain release checks. No merge, production publish, release unlock or configuration change is part of this review handoff.
- Review handoff: the user explicitly approved uploading the reviewed fixes to the same GitHub repository and opening a draft PR. The review branch is `audit/pr16-fundraising-safeguards`. This approval does not include merging or publishing to production.
