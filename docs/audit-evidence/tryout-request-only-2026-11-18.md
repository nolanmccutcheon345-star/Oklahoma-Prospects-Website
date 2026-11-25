# Request-only tryout event publication

## Demonstrated defect

The owner event editor is reachable at `/registrations` → **Access & group events**. Publishing currently requires a binding capacity and runs the legacy matcher, which can enroll existing requests and queue family notices. Merely saving a draft also runs that matcher. Neither is appropriate when the owner intends only to list already advertised events and accept requests.

## Change and acceptance

- New owner events default to explicit request-only mode with null capacity. No invented enrollment limit or reservation claim.
- Existing records default to automatic mode and retain their prior behavior. Mode is immutable.
- Owner authority is enforced in the shared executor; scoped coordinator input does not inherit the new field or nullable capacity.
- Request-only save/edit/cancel never invokes the global matcher. Global matching excludes request-only records, including on future unrelated requests.
- New scheduled requests validate against the published event and retain an authoritative snapshot/idempotency. Request-only submissions do not trigger unrelated legacy matching. Normal internal staff intake alerts remain; no family enrollment notices are created by this path.
- Explicit later manual appointment confirmation remains separate and retains existing authorization, conflict checks, reservations and notices. A null request-only cap is not interpreted as zero capacity. Owner edits are blocked once attendees are confirmed, preventing silent schedule changes.
- No production data, real registrations, messages, bookings or payments are part of this repair's verification.

## Verification

Targeted legacy event/enrollment tests, typecheck, local build and built SSR checks pass. Lint reports existing warnings and no errors. New disposable-DB regressions and the real-built-app isolated browser walkthrough cover no-side-effect publication, public selection, reload, role isolation and legacy compatibility. Exact-head CI and isolated Netlify preview remain release gates; this document is not a production release receipt.

## Publication facts remain a separate operation

No actual event is created by this change. Dates, sport, age groups, season, venue and times must be verified before publication. Calendar establishes Nov21 8U Baseball2–4pm and Nov22 12U/13U/14U2–4pm at the indoor facility. Thursday/Friday softball start/end times remain unverified. Calendar/advertisement is not a facility reservation.
