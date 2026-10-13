# Audit improvements — 13 October 2026

Follow-up to `FULL-SYSTEM-AUDIT-2026-10-13.md`. This release addresses actionable application defects while keeping external acceptance work visible. Existing lesson workspace and public journey improvements from PRs 204–205 remain intact.

## Priority order and disposition

| Finding | Work in this release | Acceptance still needed |
| --- | --- | --- |
| DATA-01 — P1 | Owner-authorized operational summary: public roster publication/withholding/revocation counts, production payment follow-up queues, and saved outcomes. Uses the same current consent predicate as public pages. Server rejects parents, coaches and ungranted admin profiles; accesses are logged without minor identities. | Owner reviews actual counts and resolves individual records through existing scoped tools. Summary is not a provider reconciliation. |
| A11Y-01 — P1 | Retains five-width keyboard/focus walkthrough; adds 200% root text-size overflow checks for training, tryouts and booking. Fixes enlarged-text overflow with wrapping lesson prices, bounded assessment controls and a reflowing header. Retry controls use minimum 44px height; pending and failed requests have explicit status/alert feedback. | Physical iPhone, VoiceOver, password manager and 2FA task completion; text resizing and Chromium are not equivalent to these. |
| PAY-01 — P1 | Payment rules, fees and live checkout remain unchanged. Existing isolated provider/reconciliation regression gates remain required. | Real provider sandbox lifecycle, correlated booking/payment/refund/renewal and delivery evidence. Automatic approval review rejected listing Netlify environment variables because it could expose payment credentials; no values were read and no alternate secret-access method was attempted. A separately configured sandbox is required before provider acceptance. |
| UX-01 — P2 | Catalog hook distinguishes loading, ready-empty, ready-data and error. Training waits for both catalog and instructor data; retry preserves filters; stale responses cannot overwrite newer results. Membership views receive the same recovery states. | Observe actual parent/coach tasks for usability evidence beyond automated checks. |
| PERF-01 — P2, partial | Removes valid embedded coach photos from public HTML and serialized data. Serves original raster bytes through a versioned, publication-checked route; current publication is rechecked before every 200 or 304. Unsupported data sources fail closed. | Responsive derivative images and controlled device/network LCP comparisons remain open. Private revalidation intentionally prioritizes withdrawal over immutable public caching. No originals were modified. |
| CONTENT-01 — P2 | Terms explicitly state the assessment exception for youth lessons age 11 and under. | Existing attorney-review notice remains; this release is not legal approval. |
| SEO-03 — P2 | `/members` now returns a server-side 301 redirect to `/account`. | None for this code defect after hosted redirect verification. |
| MEASURE-01 — P2, partial | Owner summary derives 30-day outcomes from existing durable records; no visitor tracker, new event store or minor identifiers. Production orders and order-backed bookings are explicitly scoped and labeled. | A true conversion funnel, field performance dataset and retention/purpose review for any future event collection. Current counts are statuses of records created within 30 days, not a conversion rate. |
| OPS-01 — P2 | Replaces obsolete scaffold instructions with current architecture, authoritative permission/payment rules, CI gates and Netlify release verification. | Maintain guidance alongside future platform changes. |
| SEO-01 / SEO-02 | Already corrected in PR 205; preserve exact private coach crawler boundaries and canonical public sitemap. | Ongoing indexing checks require Search Console access. |
| SHOP-01 — P2 | Preserves honest planned-collection state; does not activate unverified commerce. | Business decisions and evidence for inventory, fulfillment, tax, shipping, refunds and support before enabling products. |
| CONTENT-02 — P2 | Does not invent scholarship evidence or silently rewrite an owner's stored biography. | Owner must substantiate timeframe/denominator/source or approve factual experience-focused wording. |

## Verification and release receipt

Regression coverage includes real PGlite owner authorization and aggregate privacy, roster consent counts, photo withdrawal before conditional responses, byte-preserving photo transport, catalog failure/retry/racing requests and empty success. The existing built application browser walkthrough runs against disposable synthetic storage, including tryout persistence; no test records or charges are written to production.

Required fresh GitHub checks and the Netlify preview must pass before merge. The PR records the final CI result, preview/source identity, production deploy ID, live release commit and hosted checks. The original audit's route inventory describes its baseline; this release adds `/api/public-coach-photo/$id` and changes `/members` to a redirect.
