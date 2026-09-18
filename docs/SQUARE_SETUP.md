# Square deployment and acceptance

The checkout uses Square Web Payments SDK fields, verified account/athlete records, server-approved USD cents, and Square-confirmed payments. A temporary checkout hold is not a reservation. Ordinary lessons/packages require a coach-completed assessment. Production remains disabled until Sandbox acceptance is recorded.

## Account setup

1. Open the [Square Developer Console](https://developer.squareup.com/apps) using the business’s authorized account and select/create its application. Do not paste credentials into chat or source code.
2. Select Sandbox. In Locations, confirm ACTIVE, USD, America/Chicago, and card processing. Record the merchant ID and location ID.
3. In Netlify environment settings, add the following **function-scoped** variables for the appropriate deploy context. Secrets must be marked secret. Use separately scoped Sandbox and production values.

| Variable | Value |
|---|---|
| `SQUARE_ENVIRONMENT` | `sandbox` for deploy previews; `production` for production |
| `SQUARE_SANDBOX_APPLICATION_ID` | Sandbox application ID |
| `SQUARE_SANDBOX_LOCATION_ID` | Sandbox location ID |
| `SQUARE_SANDBOX_MERCHANT_ID` | Sandbox merchant ID |
| `SQUARE_SANDBOX_ACCESS_TOKEN` | Secret Sandbox access token |
| `SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY` | Secret signature key for this endpoint |
| `SQUARE_SANDBOX_WEBHOOK_URL` | Exact preview origin + `/api/square/webhook` |
| `APP_BASE_URL` | Canonical origin for this context |
| `SQUARE_RECONCILE_SECRET` | Random server secret shared by the scheduled function and SSR endpoint |
| `RESEND_API_KEY` | Secret transactional-email key |
| `RESEND_FROM_EMAIL` | Verified sending address |

Production uses the corresponding `SQUARE_PRODUCTION_*` variables. It also requires `SQUARE_LIVE_ENABLED=true` **and** `SQUARE_SANDBOX_VERIFIED=true`. Leave both false until the acceptance matrix below passes. Never scope production credentials to previews. The build pins its Netlify deploy context into the server bundle.

4. Review the approved catalog with `SQUARE_ENVIRONMENT=sandbox npm run square:catalog`. On a trusted terminal with the Sandbox environment already configured, run `npm run square:catalog -- --apply` to create one-time items and monthly STATIC plan variations. No customer or payment is created by this command. The output contains public catalog IDs, not secrets. Copy the eight `SQUARE_SANDBOX_PLAN_*` mappings into Netlify function variables. Repeat separately for production only after reviewing the live catalog. The retired `s6` alias resolves to `m4`; it is not a second subscription product.
5. Create the webhook endpoint at the exact URL above. Subscribe to `payment.updated`, `refund.updated`, `subscription.updated`, `invoice.payment_made`, `invoice.scheduled_charge_failed`, `dispute.created`, and `card.automatically_updated`. Match the URL exactly, including its path; do not add a trailing slash. Copy its signature key directly into Netlify.
6. Redeploy. In the owner payment console at `/office`, verify the Square location and review failed events, refunds, subscription setup, email delivery, and disputes.
7. Configure the standard cage booking window (1–13 days) in the owner console before enabling All-Star enrollment. All-Star receives the specified 14 days. Configure coach/facility resources in Operations. Small-group enrollment remains closed until the weekly group schedule and enrollment policy are approved and implemented.

## Runtime and recovery

- TanStack server functions provide authenticated create-payment, membership setup, refund, and management actions on both Netlify and the existing Grok-compatible build. They are not unauthenticated standalone payment URLs.
- Square collects card data and performs integrated buyer verification in `card.tokenize(...)`. Card-on-file changes use `STORE`; purchases use `CHARGE`. Tokens are never stored in the database or logs.
- The first membership month is collected immediately. When applicable, the separate $50 first-month fee is collected next. Both must succeed before booking confirmation. The completed payment can create the Square card on file. The monthly subscription starts on the next Chicago billing date, avoiding a second first-month charge.
- A partial checkout that expires cannot become a booking. Reconciliation submits refunds for its collected payments. Refund confirmation can remain pending at Square.
- Webhooks store an event ID and object reference, verify the raw signature, retrieve the current Square object, and apply idempotent ledger changes. They return 503 on incomplete processing so Square retries. The production scheduled function and owner retry action recover pending work.
- Never switch an already-used checkout between Sandbox and production. Those records and catalog objects are separate.
- Refunds operate against the original Square payment balance. Owner refunds require a reason and explicit approval to withdraw unused credits/cancel covered future bookings. Past sessions remain in the audit history.
- Pauses require the owner to approve their number of billing cycles. Current credit expiry is retained; any extension needs a separately approved policy. Families can stop renewal, update their card, and resume a paused membership online.
- Package/current-month self-service refund anchors and half-credit restoration remain policy gates. Such requests require office review rather than an invented amount. Small-group seats/scheduling are not activated by adding a catalog plan.

## Acceptance before enabling production

Use synthetic accounts and Square Sandbox only. Do not run real charges or enter real customer/card data during testing.

- Approved amount for every product, assessment exemption, $50 fee exactly once, ordinary lesson/package assessment lock, verified household ownership, and no guest/URL-price bypass.
- Success, decline, CVV, postal, expiry and 3DS challenge/failure cases using [Square’s documented Sandbox fixtures](https://developer.squareup.com/docs/devtools/sandbox/payments).
- Two simultaneous buyers for the same lane/coach/athlete; repeated clicks; retry after network interruption; used-token retry; expired and partially paid holds. No duplicate charge/booking/grant.
- Initial month plus fee; four ordinary credits preserved when the first booking is an assessment; ordinary first lesson records one credit use; each renewal grants once only after payment; failed renewal grants nothing and queues an update-card notice.
- Next billing date, stop renewal before the first scheduled renewal, pause/resume, and verified card replacement. Confirm all outcomes by retrieving the actual Square objects.
- Cancellation at the exact 48/24-hour boundaries, credit restoration once, original expiry retained, owner partial refunds capped to remaining balance, and repeated refund delivery.
- Authentic/forged/changed-body webhook, duplicate events, late/out-of-order events, reconciliation after failure, dispute alert and automatically updated card.
- Desktop and mobile card field rendering, 3DS, consent, itemized prices, expiration, accessible errors, persistent receipts, and transactional email delivery.

`npm run test:square` is the repository’s offline test suite. It is **not** the separately requested `prospects-payments-audit.mjs`; that script was not supplied. Neither offline tests nor a green build proves that a seller account can accept payments.

## Owner-selected phased release: one-time cage bookings

On September 17, 2026 the owner delegated the launch decision after being offered a cage-only first release. This phase uses `SQUARE_CHECKOUT_SCOPE=cages` and a separate `SQUARE_CAGE_SANDBOX_VERIFIED=true` acceptance flag, together with `SQUARE_LIVE_ENABLED=true`. It does **not** set the full `SQUARE_SANDBOX_VERIFIED` flag. Both checkout creation and payment submission enforce the scope against the server-approved quote; existing unpaid non-cage orders cannot be charged. A recurring quote is rejected even if its kind is altered to cage. Unknown scope values fail closed.

For this phase, accept cage pricing/hours/household and team rules, verified ownership, idempotent fulfillment and occupancy constraints, decline/CVV/ZIP/expiration behavior, 3DS, refunds, webhook verification/recovery, saved receipts and receipt email. Recurring plans, assessments, lessons and packages remain unavailable for purchase. The full matrix above remains required for the later all-products release. Missing monthly catalog mappings must not be treated as completed membership acceptance.

The owner payment console includes a receipt test addressed only to the authenticated owner's account, with provider delivery status checking restricted to that same recipient. Sandbox customer notifications remain suppressed; the test does not claim a purchase or create a booking.

The queued receipt test now uses the same notification worker as normal receipts. It is restricted to Sandbox, the authenticated owner's user ID and verified email, and an existing pending receipt with a saved Square receipt URL. The email explicitly labels the Sandbox payment and does not claim an active booking. Normal Sandbox processing still suppresses customer mail. Both normal and test queue selection filter the payment provider and environment; production cannot drain pending Sandbox receipts. Provider failures leave notices pending, and repeated sends retain the same idempotency key. Offline regression tests exercise the real SQL selection and status updates with a simulated provider; hosted provider acceptance and inbox delivery must be recorded separately.

## Owner catalog preparation in either environment

The authenticated owner console can now prepare monthly plans and connect membership webhook events in its configured environment. The same location, merchant, currency, card capability, plan price and idempotency checks apply in production. Mappings stay isolated by environment/merchant/location/product. These setup actions create no customer, card, charge or subscription, and do not change checkout scope or acceptance flags. Production can be prepared while one-time cages remain the only enabled checkout. Webhook verification reports pending events instead of presenting an unconditional success message when only some events have processed.
