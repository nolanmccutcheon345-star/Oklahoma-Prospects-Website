# Owner facility blocks

Office → Bookings exposes a separate owner-only reservation path for workouts and facility use. It does not create a team practice, customer order, payment, fee adjustment or family notice. The retired coordinator-wide grant remains disabled.

A verified, non-restricted owner grant is checked server-side for every read/write. Creation and cancellation use the financial execution lock and shared booking occupancy. Any conflict rolls the transaction back; a concurrent customer checkout cannot acquire the same resource/time cell. Fielding uses the existing `lane:3-4` identifier. The additive metadata table is RLS-enabled and revoked from public. Audit entries record create/cancel.

Creation UUIDs are idempotent only for an identical, still-confirmed request. UI retries preserve that UUID and payload. Cancellation preserves the booking and metadata, releases only its occupancy and cannot target customer purchases. Blocks respect existing facility hours and 30-minute starts/durations.

Release verification: run focused facility-block tests, typecheck, lint, build, verify:build and required CI/preview checks. After deployment, create only an authorized actual block, reload the list, and confirm public availability excludes every reserved space for the whole time range. A passing fixture does not prove a production block exists.

## Reconciliation after the published tryout request-only migration

Main already uses Netlify version 0120 for `0120_tryout_request_only.sql`. Facility blocks therefore append at Netlify version 0121, while retaining the original application ledger key `0120_facility_blocks.sql`. The generator removes only the obsolete generated facility wrapper, not the published tryout migration or any remote data. Regression coverage checks version uniqueness, repeated application, existing customer occupancy, atomic conflict rejection and restricted-owner denial. No database cleanup or preview deletion is part of this reconciliation.
