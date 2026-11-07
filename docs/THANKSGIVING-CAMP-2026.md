# Thanksgiving Camp 2026

## Scope

Dedicated `/thanksgiving-camp` page, homepage and tryouts-page links. The existing tryouts form, team pages and shop are unchanged. The camp uses the existing verified-parent / household-player / Square card-payment pipeline and private office camp roster. No new payment provider or credentials.

Dates: November 23–25, 2026. Ages 6–9U: 9–11:30 a.m. Central. Ages 10U–14U: 1–3:30 p.m. Central. One day $45, two days $90, all three $120 (including when all three individual checkboxes are selected). Both age groups share a conservative maximum of 150 registrations per day, including payment holds and office enrollments.

Activities: baseball includes hitting, fielding, pitching, baserunning and games. Softball is hitting and defense only, with no pitching, following the corrected v4 flyer direction. No old camp flyer is embedded on this page.

Approved policy: full refund with at least 24 hours' cancellation notice before the start of the first day selected in the registration. After that, no refund. The precise deadline appears at checkout. Full-camp deadlines are Sunday November 22 at 9 a.m. for the younger group and 1 p.m. for the older group. Refunds remain office-reviewed through existing payment controls; this feature does not automatically issue refunds or alter unrelated policies.

## Owner setup after release

1. Sign in to the academy office with an existing owner account. Open Events / Camps & Clinics.
2. Expand **Thanksgiving Camp setup** and choose **Create Thanksgiving Camp drafts**. This is idempotent and never replaces existing events. It requires unambiguous active coach-directory entries for Steve McCutcheon, Nolan McCutcheon and Billy Ramey.
3. Review both age-group drafts, approved policy, assigned coaches and facility schedule. Publish each draft when ready. Existing scheduling checks reject coach conflicts. Do not bypass those checks.
4. Public signup remains closed if no matching published event exists, Square is unavailable for events, or confirmation-email configuration is absent.
5. Edit the event description for camp announcements. Operational schedule changes show on the camp page through the existing scheduling layer. No other event's announcements are included.
6. New paid registrations appear under the relevant event's **Registered players**, including parent name, verified email, phone, sport, age group and dates. Only authorized owners can read this office list.

## Notifications

Verified paid fulfillment queues the parent confirmation and a dedicated alert to `prospectssportsacademy@gmail.com`. Steve's alert includes camp/session information, amount and an authenticated office link, without player identity or parent contact details. Parent confirmations contain their selected sessions, location, amount and camp-announcements link. Existing scheduled delivery retries apply. Full refunds resolve pending camp confirmations/alerts. Ordinary Sandbox mail remains suppressed by the existing provider safeguards.

For explicitly approved delivery acceptance, an owner may use **Square payments → Thanksgiving Camp email acceptance** in an isolated non-production Sandbox. Enter only that owner's own recent, verified-paid synthetic camp order. Review the exact owner-account and academy destinations before sending. The dedicated control exercises the same camp templates with a prominent Sandbox label, creates no charge or registration, and never sends a general queue. Successful test notices record `sandbox-test-accepted`; partial retries retain stable provider keys and skip accepted notices. Preserve the displayed provider IDs and verify both inboxes. Production, another person's order, missing verification, refunds, stale notices and incomplete sessions fail closed. The generic staff/owner alert test is not a substitute and may target more people.

Provider acceptance is not inbox delivery. Do not call this signup live until authorized end-to-end provider testing confirms payment/registration and both messages arrive. Do not create real charges, use customer records, publish fixture accounts or weaken production/preview isolation for testing.

## Verification

- `npm run typecheck`
- `NETLIFY=true CONTEXT=dev SQUARE_LIVE_ENABLED=false SQUARE_ENVIRONMENT=sandbox npm run build`
- `npm run verify:build`
- `node --import tsx --test --test-concurrency=1 src/lib/thanksgiving-camp.test.ts src/lib/commerce/thanksgiving-notifications.test.ts src/lib/training-events.test.ts src/lib/camp-days.test.ts src/lib/commerce/square.test.ts`
- `node --test scripts/training-events-render.test.mjs`
- `node --import tsx scripts/check-thanksgiving-camp.mjs` (synthetic, external requests blocked; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chromium)
- Required repository CI, including full regression, lint, audit and existing isolated walkthroughs.

The browser fixture tests layout, selected-day and full-camp form flow, contact fields, refund cutoffs, locked checkout selection and reload. It does not claim a real Square transaction or real email delivery. The integration fixtures test server-side ownership, ages, shared capacity, immutable checkout retries, verified fulfillment and private/public separation.
