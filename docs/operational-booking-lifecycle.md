# Operational booking and event lifecycle

Reconstructed and revalidated after the executor restart. This is not asserted to be a byte-identical recovery of the lost local branch. No live database migration, grant, charge, refund or deployment was performed by this work.

## Supported operational workflows

- Customer booking delivery reschedule, cancellation, restoration and annual-waiver-gated check-in.
- Camp/clinic group session reschedule, cancellation and restoration using immutable original session keys. Individual purchased camp attendance can be withdrawn or checked in separately.
- Unpriced event draft creation with exact-payload retry binding; metadata editing; draft/open/closed/archive publication states.
- Additional event sessions, operational capacity, instructor assignments, manual enrollment/unenrollment and check-in.
- Public and household schedules show effective delivery. Added sessions never silently extend a purchased package. Unpriced listings offer office enrollment without a fake zero-price checkout.
- Operational archive hides public discovery and closes new enrollment; existing delivery and accepted payment sessions remain intact.

## Financial and identity boundary

0071 adds operational records, an append-only history and `operational_booking_schedule`. Original paid booking dates/status/check-in, orders, Square balances, credits, refunds and financial compensation inputs are not rewritten by operational lifecycle commands. Slot occupancy is updated atomically with the overlay under the financial execution gate. Raw provider cancellation/refund status supersedes an attempted operational restoration.

Paid lifecycle changes require the database-selected active financial basis. Capturing a basis alone does not enable them. Newly authored unpriced events work before cutover. All staff mutations check the current verified, non-disabled organization operator and compare revisions inside the gated transaction. Browser role values confer no authority.

Prepared event orders retain original purchased dates and immutable tuple aliases. Operations can alter delivery while the original verified payment completes once. Added sessions remain separate manual entitlements. Unknown payment attempts continue reserving admission/athlete conflicts. Paid booking allocation uses a savepoint so a slot conflict rolls back the provisional booking, immutable financial binding and operational overlay together.

Parent financial cancellation and rescheduling continue to use original financial inputs. Their family schedule uses the effective view, with separately identified financial status for existing refund/reschedule controls. A deliberate customer financial reschedule supersedes an older delivery-time overlay.

New lesson slot selection, redemption and rescheduling consume current operational instructor availability inside the final gated write. Prepared/paid charge validation uses original approved terms and bypasses only the operational availability overlay. Event scheduling retains its existing explicit instructor/occupancy model rather than imposing recurring private-lesson windows on camps.

## Privacy and remaining boundaries

- Existing unpublished or historical commercial descriptions, names and locations are withheld from the operational workspace unless they are already public upcoming source copy. Nested JSON is never hydrated into scalar fields. Safe placeholders and original session identity fields remain usable for operations.
- Existing published metadata is edited through Catalog. Newly authored operational draft metadata is editable directly. This lane does not classify old private commercial prose.
- Owners retain the existing priced Event Office creation workflow. There is no same-ID operational-draft-to-commercial-offer adoption command in this lane; it would require explicit owner review and exact-version financial initialization. Operational drafts remain unpriced/manual unless owners separately create an approved offer.
- Guided lesson work must be resolved before moving its active booking, and checked-in event sessions cannot be moved. These preserve existing instructor work and attendance integrity.
- These tests establish local database and component behavior. They do not certify live Square processing, notifications, deployment, or real-device accessibility.

## Verification

- `src/lib/coordinator/organization-bookings.test.ts`: thirteen disposable-database cases covering financial byte equality, actual refund-preview invariance, current authorization, collisions/CAS, pending and unknown payment attempts, repeated provider delivery, legacy tuple aliases, current waiver checks, independent event drafts/manual enrollment, added-session identity, private-copy canaries and household schedule consistency.
- `src/lib/commerce/operational-schedule.test.ts`: additive schema, immutable history/identity, base-status precedence and occupancy rollback.
- Existing camp/day payment, reschedule/refund, lesson assignment, Catalog, compensation, family/waiver and coach regressions.
- `scripts/organization-bookings-render.test.mjs` plus existing training-event/Catalog render suites: exact revision-bound payloads, duplicate submissions, close, stale failures, denial cleanup and public/manual schedule rendering.
