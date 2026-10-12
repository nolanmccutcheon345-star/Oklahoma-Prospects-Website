# Instructor lesson integration repair — controlled release report

Date: October 12, 2026 (America/Chicago)

**Release decision: HOLD. Implemented on `feat/booking-guided-lessons-20261012`; not production-ready or deployed to production.** The focused workflow passes the tests below, but the hosted end-to-end and review gates are not yet clear. Production data has not been migrated or rewritten by this work.

## Implemented repairs

- Guided lessons resolve the verified booking, assigned instructor, player, purchased service snapshot/version, explicit sport and actual appointment duration. Player position is never used to choose discipline.
- New direct checkout quotes retain service configuration; paid fulfillment carries that snapshot into the booking. Credit bookings snapshot their redeemed service. The sport selector supports two-sport players. A timestamp is deliberately excluded from the checkout fingerprint so retries stay stable.
- Older ambiguous bookings stop with an actionable error. An admin can explicitly document the source used to resolve an unstarted lesson's sport/discipline. This is marked as a reviewed legacy configuration (unknown historical service version), not a fabricated purchased version.
- A versioned template is saved when the lesson opens. Existing drills, warm-up references, suitable Game IQ curriculum and the TCI scoring function are reused. New fielding fundamentals, softball underhand pitching, and strength/speed blocks do not fall back to baseball pitching.
- The sequence is Setup → Briefing → General Warm-up → Sport-Specific Warm-up → Drills → Tracking/Assessment → Game IQ → Recap. Every plan totals the purchased duration. Actual minutes are recorded separately. The 75-minute plan uses baseline, focused adjustment, recovery and comparable retest.
- Age/level, recent lessons, assessments, goals, development plans, throwing plans and workload inform the template/context. The instructor must review readiness and document restrictions or objective overrides. These controls do not manufacture medical clearance.
- Pitching, hitting, catching, fielding and strength/speed have distinct structured practice logs. Drafts persist in PostgreSQL with revision checks. Published pitching command logs feed existing TCI history; other disciplines never create pitching charts.
- **Save Draft** and **Publish & Complete Session** are distinct. Completion locks the booking/session, verifies assigned instructor or admin and player association, validates attendance and documentation, runs existing assessment/earnings logic and publishes the record in one transaction. Repeated completion is idempotent.
- No payment collection, refund, balance adjustment or recruiting verification is performed by this completion path. Recruiting measurement verification remains a separate explicit action with its existing consent/access controls.
- Families receive their own published history with private instructor notes removed. Drafts and instructor context are not exposed through family history. Earlier completed bookings remain read-only; older local drafts remain downloadable for reviewed recovery.
- The old completion endpoint refuses incomplete legacy calls and directs instructors to the authoritative workflow. Existing scheduling, payment fulfillment, recruiting, standalone development tools and historical records remain in place.

## Template coverage

Registry version: **2026-10-12.1**. These are engine capabilities, not newly published services or prices.

| Sport | Discipline | 30 min | 60 min | 75 min |
|---|---|---|---|---|
| Baseball | Pitching | Covered | Covered | Covered |
| Softball | Pitching (underhand) | Covered | Covered | Covered |
| Baseball / Softball | Hitting | Covered | Covered | Covered |
| Baseball / Softball | Catching | Covered | Covered | Covered |
| Baseball / Softball | Fielding / Defense | Covered | Covered | Covered |
| Baseball / Softball | Strength / Speed | Covered | Covered | Covered |

All 30 registry combinations are tested for duration totals. Every active scheduled lesson in the **migration-seeded test catalog** resolves. The existing `s5` asynchronous 20-minute video review uses its separate workflow; it does not create a scheduled guided session. Unsupported disciplines/durations stop explicitly.

[Detailed seeded catalog coverage](lesson-system-evidence/seeded-template-coverage.json). The live admin-edited catalog has **not** been certified. The new admin read-only report enumerates actual active services and flags unsupported combinations. Curriculum, especially the new 75-minute and softball variants, still requires coaching review before release; a technical pass is not coaching approval.

## Verification evidence

| Check | Result | Scope |
|---|---|---|
| TypeScript check | PASS | Full application |
| Netlify production build | PASS | Generated Netlify server and additive migration bundle; no DB writes |
| Built-server HTTP smoke | PASS | Six public/login/not-found responses, CSP/hydration nonce and private caching |
| Focused integration/permission/completion regression run | PASS — 38 tests | Real server commands and all migrations against disposable PostgreSQL/PGlite |
| New module lint | PASS | Template, session server/API and lesson screen |
| Authenticated Chromium instructor walkthrough | PASS — six sessions | Actual lesson React screen, real Better Auth login and disposable migrated DB |
| Full-site regression suite | PASS — 870/870 | No failures, skips or cancellations |
| Full lint | PASS | Zero errors; 109 existing/style warnings remain |
| Dependency audit | PASS | Zero reported vulnerabilities |
| Full hosted application/authenticated route walkthrough | NOT COMPLETE | The component walkthrough bridges server-function transport; it does not certify hosted routing, middleware delivery, provider sandbox or production infrastructure |
| Production historical exception scan | NOT RUN | No production athlete records were queried or rewritten |

The integration tests cover: pitcher booking hitting; two-sport athlete; warm-up order and duration; hitting/catching/fielding draft save and reopen; publication and permanent history; TCI integration; wrong instructor/family denial; direct unprivileged database denial; stale drafts; no-shows/partial/incomplete sessions; cancelled bookings; immutable template snapshots; reviewed legacy configuration; unpaid-order completion denial; existing account/waiver/credit/payment fulfillment; and explicit player-account linkage.

A synthetic earnings failure verifies rollback of the booking, assessment and publication. Simultaneous identical completion attempts then create exactly one assessment and earnings row. Order/payment rows remain unchanged; recruiting metrics are not created by practice logs.

### Browser walkthrough

Synthetic player/instructor only. Both sports each run 30, 60 and 75 minutes. Hitting, catching, fielding, baseball pitching and softball pitching are represented. Every case saves tracking, reloads the saved recap, completes, checks the authoritative booking and one earnings row, and checks mobile document overflow and browser page errors.

| Case | Tracking screenshot | Completed screenshot |
|---|---|---|
| Baseball hitting, 30 min | [Tracking](lesson-system-evidence/baseball30-tracking.png) | [Completed](lesson-system-evidence/baseball30-completed.png) |
| Softball catching, 30 min | [Tracking](lesson-system-evidence/softball30-tracking.png) | [Completed](lesson-system-evidence/softball30-completed.png) |
| Baseball fielding, 60 min | [Tracking](lesson-system-evidence/baseball60-tracking.png) | [Completed](lesson-system-evidence/baseball60-completed.png) |
| Softball pitching, 60 min | [Tracking](lesson-system-evidence/softball60-tracking.png) | [Completed](lesson-system-evidence/softball60-completed.png) |
| Baseball pitching, 75 min | [Tracking](lesson-system-evidence/baseball75-tracking.png) | [Completed](lesson-system-evidence/baseball75-completed.png) |
| Softball pitching, 75 min | [Tracking](lesson-system-evidence/softball75-tracking.png) | [Completed](lesson-system-evidence/softball75-completed.png) |

[Walkthrough result](lesson-system-evidence/walkthrough.json). Screenshots show real rendered components, not design mockups. The harness substitutes HTTP/server-function transport and captures outgoing email locally. It does not contact payment providers; the separate recruiting-verification action is not exercised by this browser harness. Existing recruiting server tests provide separate regression coverage.

## Database objects and preservation

Additive migration: `migrations/0056_guided_lesson_sessions.sql` and generated Netlify counterpart.

- `club_services.lesson_version` and `bump_lesson_service_version()` / `lesson_service_version` update trigger.
- `booking_records.lesson_sport`, `lesson_config`, and `snapshot_booked_lesson()` / insert trigger.
- `guided_lesson_sessions`, unique booking association, athlete history index, RLS/public revocation and existing audit trigger.
- Existing `booking_records`, `athlete_assessments` and `contractor_earnings` receive normal completion writes only when explicitly publishing an authorized session. There is no destructive migration or historical backfill.

The exception report identifies possible legacy fielding/pitching conflicts using lesson context plus same-day bullpen records, and changed booking associations after a draft starts. These are **candidates, not proven errors**. The production count is unknown until an authorized read-only scan is reviewed. No automatic historical correction is provided.

## Remaining release gates and limitations

1. Full regression now passes. Updated stale navigation/age/copy assertions and incomplete test fixtures, and added explicit submit types to five existing form actions. Player-account fixtures use explicit `person_player_links`, without relaxing access rules. Generated test bundles are excluded from lint; source remains checked. Review these supporting repairs alongside the lesson changes.
2. The attempted built-application login walkthrough stops at the production authentication configuration guard because the disposable environment has no configured production account database. That guard was not weakened. Confirm an isolated hosted preview database and complete the full application route/middleware walkthrough, including checkout selection, instructor desk entry and family history. The browser component test is strong workflow evidence, not a substitute for that gate.
3. Review the live catalog coverage and new coaching curriculum. No active service is automatically reconfigured by this release.
4. Run and review the production historical exception report read-only. Preserve original records and use a separately reviewed correction for any confirmed anomaly.
5. Drafts whose booking is reassigned/rescheduled after initialization fail closed and retain their original snapshot. They require explicit admin exception review; this release does not silently migrate their saved tracking to a changed appointment.
6. Unstarted older bookings without a trustworthy service snapshot/sport require documented admin resolution. Existing completed lessons are not upgraded into fabricated guided histories.
7. Independent release review and passing required checks are required before merging/deploying production. No production-readiness claim is made from compilation or isolated tests.

## Reproduction

- `npm run typecheck`
- `NETLIFY=true npm run build` then `npm run verify:build`
- `node --import tsx --test --test-concurrency=1 scripts/guided-lesson-integration.test.mjs scripts/audit-workflows.test.mjs src/lib/paid-session-completion.test.ts src/lib/active-session-coaches.test.ts src/lib/pd/player-record-authority.test.ts`
- `NETLIFY=true npm run test:guided:browser` after installing Playwright Chromium. Optional `LESSON_BROWSER_EXECUTABLE` selects an installed browser; `LESSON_SCREENSHOT_DIR` selects the evidence destination.
- `npm test` for the broader release gate.

The audit harness refuses external database and payment/email credentials. CI includes a separate post-build browser step and uploads evidence when that step runs.

## Files modified or added

- `.github/workflows/verify.yml`
- `docs/INSTRUCTOR-LESSON-REPAIR-2026-10-12.md`
- `eslint.config.mjs`
- `migrations/0056_guided_lesson_sessions.sql`
- `netlify/database/migrations/0056_guided-lesson-sessions/migration.sql`
- `package.json`
- `scripts/audit-navigation-render.test.mjs`
- `scripts/audit-support.mjs`
- `scripts/audit-workflows.test.mjs`
- `scripts/discount-checkout-render.test.mjs`
- `scripts/guided-lesson-integration.test.mjs`
- `scripts/guided-lesson-walkthrough.mjs`
- `scripts/lesson-times-navigation.test.mjs`
- `scripts/office-navigation.test.mjs`
- `scripts/render-component-support.mjs`
- `scripts/training-assessment-first.test.mjs`
- `scripts/tryout-season-selector.test.mjs`
- `src/components/commerce/coach-sessions.tsx`
- `src/components/commerce/credit-booking.tsx`
- `src/components/commerce/operations.tsx`
- `src/components/commerce/saved-methods.tsx`
- `src/components/finance/my-finance.tsx`
- `src/components/pd/athlete-record.tsx`
- `src/components/pd/booked-guided-lesson.tsx`
- `src/components/pd/guided-lesson.tsx`
- `src/components/teams/fee-workspace.tsx`
- `src/components/teams/team-activities.tsx`
- `src/components/teams/team-payment.tsx`
- `src/lib/active-session-coaches.test.ts`
- `src/lib/commerce/checkout.server.ts`
- `src/lib/commerce/contracts.ts`
- `src/lib/commerce/credits.server.ts`
- `src/lib/commerce/development.server.ts`
- `src/lib/commerce/portal.server.ts`
- `src/lib/commerce/redemption.ts`
- `src/lib/commerce/square-payments.server.ts`
- `src/lib/commerce/store.server.ts`
- `src/lib/paid-session-completion.test.ts`
- `src/lib/pd/lesson-session-api.ts`
- `src/lib/pd/lesson-session.server.ts`
- `src/lib/pd/lesson-templates.ts`
- `src/lib/pd/player-record-authority.test.ts`
- `src/lib/recruiting.test.ts`
- `src/lib/teams/budget-matrix.test.ts`
- `src/lib/teams/fee.server.test.ts`
- `src/lib/training-events.test.ts`
- `src/routes/coaches.tsx`
- `src/routes/instructors.tsx`
- `src/routes/pay.tsx`
- `docs/lesson-system-evidence/`: 12 synthetic workflow screenshots, walkthrough JSON and seeded coverage JSON.
