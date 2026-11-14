# Owner facility blocks

Office → Bookings exposes a separate owner-only reservation path for workouts and facility use. It does not create a team practice, customer order, payment, fee adjustment or family notice. The retired coordinator-wide grant remains disabled.

A verified, non-restricted owner grant is checked server-side for every read/write. Creation and cancellation use the financial execution lock and shared booking occupancy. Any conflict rolls the transaction back; a concurrent customer checkout cannot acquire the same resource/time cell. Fielding uses the existing `lane:3-4` identifier. The additive metadata table is RLS-enabled and revoked from public. Audit entries record create/cancel.

Creation UUIDs are idempotent only for an identical, still-confirmed request. UI retries preserve that UUID and payload. Cancellation preserves the booking and metadata, releases only its occupancy and cannot target customer purchases. Blocks respect existing facility hours and 30-minute starts/durations.

Release verification: run focused facility-block tests, typecheck, lint, build, verify:build and required CI/preview checks. After deployment, create only an authorized actual block, reload the list, and confirm public availability excludes every reserved space for the whole time range. A passing fixture does not prove a production block exists.
