# Audit repairs — September 29, 2026

This branch implements the confirmed repository defects from the September 28 full-site audit. It incorporates the previously approved registration-reader, softball, and Watch Live changes and merges main's payment recovery safeguards (through `cbb47be`). It does not certify a production deployment or complete the external payment and data-recovery acceptance gates.

## Issue disposition

| Audit ID | Repository repair | Remaining acceptance boundary |
|---|---|---|
| OP-01 | Catalog buttons use the server's public checkout scope; unavailable products lead to a prefilled inquiry. | Enable each payment family only after actual Square sandbox lifecycle acceptance. |
| OP-02 | Catalog displays and quotes use the same approved integer-cent prices; unsupported custom products remain drafts. | New prices require a versioned catalog change. |
| OP-03 | First-month display and quote use the same exact $50 assessment premium. | Existing paid order snapshots remain unchanged. |
| OP-04 | Known pitching/hitting first assessments use their standard 60-minute price plus exactly $50. Newly quoted in-person memberships count the first assessment as one included session. Legacy snapshots retain their original credit treatment. | First-appointment mapping for 30-minute lessons, catching, and fielding needs an approved service/duration policy. |
| OP-05 | Owner operations exposes claimed/unclaimed athlete counts and development/program/chart counts to support recovery diagnosis. | Missing historical records cannot be reconstructed without a known-good export and approved database comparison. No invented athletes or history. |
| OP-06 | Strength customization persists as immutable draft/published versions with inputs, generator version, prescription, author, and timestamp. Logged sets can reference the assigned version. | Real historical prescriptions still require the OP-05 source. |
| OP-07 | Bullpen pitch charts persist, server-derived scoring/counts survive reload, and tracked pitches contribute to workload without double-counting a larger daily total. First/new bullpen entry is available. | No live athlete data was changed. |
| OP-08 | Throwing prescriptions retain prior versions. Family day selection is stored separately against the assigned template. | Historical overwritten assignments cannot be recovered from code alone. |
| OP-09 | Coaching dates, age, recent outings, seasonal context, and rescheduling use the current club clock rather than September constants. | Chicago midnight, DST, month, and notice boundaries are covered by fixed-clock tests. |
| OP-10 | A coach can also access their household as a parent; coach privileges apply only to athletes they coach. Private notes, group edits, metrics, and plan commands enforce that distinction. | Production staff and household mappings remain untouched. |
| OP-11 | Youth lessons are discoverable through a 30/60-minute, four-discipline inquiry flow for ages 10 and under. | Final processing-inclusive prices, age cutoff timing, youth-instructor assignments, and exemption acknowledgment must be confirmed before youth checkout. |
| OP-12 | Athlete DOB, sport, and position can be completed in My programs. Strength suggestions are identified as previews; publication requires a complete basic profile, completed assessment, and coach review. | Discipline-specific assessment validity/expiry and clinical return-to-play rules are not invented by this repair. |
| OP-13 | Train leads to assigned My programs; every authorized role can select its athlete and open saved strength/throwing work. Curriculum remains secondary; staff landing copy emphasizes operations. | Rendered component interactions are tested; phone geometry still needs hosted browser acceptance. |
| OP-14 | Four primary tabs: Home, Train, Teams, Book. Teams has Baseball and Softball secondary links. Live, donations, and visit links remain accessible. Fixed controls share a safe-area-aware navigation offset. | iPhone/Android scroll and keyboard geometry are not certified by JSDOM. |
| OP-15 | Copy uses four sessions per billing month, states remote assessment eligibility, and removes an unsupported automatic quarterly-lab promise. Group purchases remain inquiry-only. | Group calendar/capacity and quarterly-lab entitlement require approved delivery rules. |
| OP-16 | A permitted athlete deep link now loads and selects the record; denied/failed loads show an error. | Covered with a newly authorized athlete and actual database-backed server commands. |
| OP-17 | Failed saves retain a session draft with explicit retry/download. Three-way recovery preserves unrelated remote edits and refuses same-record conflicts. Education progress persists per verified account. Account changes clear prior drafts and ignore stale responses. Older clients preserve newly added fields. | Conflicting edits require deliberate reconciliation; the app never silently overwrites the other editor. |
| OP-18 | Existing payment, refund, recovery, and compensation protections are retained. Financial facts cannot be forged through the coaching working file. | Actual Square reconciliation and coach-agreement validation still require provider records and agreements. |
| OP-19 | Every normal build emits `/release.json` with source commit and migration checksums. Disposable-database export/restore checks preserve programs, lesson records, charts, and education. | This is not evidence of a real historical production backup or restore. Verify the deployed manifest against the approved commit. |
| OP-20 | The date-sensitive regression test uses a controlled clock. | No remaining code block for this finding. |
| OP-21 | Confirmed/completed ledger bookings connect the assigned active coach to the athlete's development scope. Cancellation removes booking-only access; explicit assignment and household access are preserved. | Production bookings and access grants are not manufactured. |

## Verification

The tests use migrated disposable PostgreSQL-compatible databases, actual identity/server commands, and rendered React components. Payment transport and email delivery are simulated; they do not charge cards or send messages to real families. The test harness refuses external database/payment credentials.

Coverage includes account signup/verification/reset/signout; sibling and unrelated-household boundaries; coach-parent and assigned-coach access; assessment purchase/completion; package credits and duplicate redemption; waivers; coach recaps with parent/player reload; immutable program versions; family draft isolation; bullpen and throwing persistence; failed-save retry; education isolation; registration-reader restrictions; softball submission; fundraising approval/privacy/totals; catalog pricing; checkout scope; and Baseball/Softball navigation.

Local results: **560 tests passed, 0 failed, 0 skipped**; an additional final 41-test message/development/account regression run passed after message-save normalization. TypeScript, the Netlify build, and built-server checks passed. ESLint returned 0 errors and 59 warnings (warnings remain; this is not a warning-free claim). `npm audit --audit-level=high` reported 0 vulnerabilities. Required commands:

```sh
npm test
npm run typecheck
npm run lint
NETLIFY=true CONTEXT=deploy-preview npm run build
npm run verify:build
```

The development preview could not start in this execution environment because Node's network-interface lookup failed (`uv_interface_addresses`). Earlier browser access to the local preview was blocked. Component rendering and server rendering therefore do **not** count as a completed real-browser mobile/hydration pass. No production deployment is claimed.

## Release and recovery

1. Keep current checkout gates until provider-specific acceptance is complete. Do not enable live lesson, membership, youth, or group checkout merely because isolated tests pass.
2. Before production rollout, retain a real database export and reconcile representative athlete/order IDs. Rehearse restoration into an isolated environment; never overwrite production with test fixtures.
3. Build from the approved commit, inspect `/release.json`, and compare the commit and migration checksums. This branch includes the previously approved registration-reader migration; it must remain consistent with the target database's migration history.
4. Verify a hosted preview with separate test credentials: mobile scrolling/keyboard, signup/email, parent/player/coaching workflows, and Square sandbox purchase/renewal/cancel/refund. Avoid production credentials in previews.
5. Roll back application code to the prior verified release if needed; retain the additive program/history fields and existing money ledger. Do not delete newly saved versions or rewrite paid snapshots as part of rollback.

Open business decisions and unavailable production evidence remain explicit above. They are not marked fixed merely because the surrounding interface or tests were repaired.
