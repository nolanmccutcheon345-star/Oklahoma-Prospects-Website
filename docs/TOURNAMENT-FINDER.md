# Prospects Tournament Finder

## Scope

The Coach desk now replaces its older unfiltered Schedule picker with the Prospects Tournament Finder. Front Office has a dedicated Tournament Finder navigation item. Both use the existing authenticated ClubRecord and saveTeamsClub flow. This is not a new public page, scraper, paid API, or nationwide event feed.

- Search event name, organizer, or city; filter baseball/softball, age, state, date overlap, division, recorded entry cost, event type, stay-to-play, recorded drive distance, and existing team selections.
- Default to the chosen team's sport, age, and season. Custom ranges include multi-day events overlapping either boundary.
- Sort by date, cost, or recorded distance. Missing distance never counts as zero and is excluded when a maximum distance is selected. Distances are manual office estimates from Broken Arrow, not GPS or live-routing results.
- Add/remove existing catalog events through the same persisted team selection field previously used by the Coach Schedule picker. Saves are immediate, guarded against duplicate clicks, and report success only after the server responds. The UI refreshes the mounted budget workspace after a successful schedule save.
- Front Office can add and edit manual catalog records. Coaches cannot edit the catalog or another team's selections. Family/player routes do not expose this tool. Existing server identity and assigned-team scoping remain authoritative.
- Catalog records referenced by any stored team, including closed teams, allow only organizer-source metadata and distance edits. Substantive event changes/deletion are rejected server-side even if the incoming payload also removes the schedule reference. This avoids rewriting historical event costs/dates/eligibility. Unscheduled records remain editable.
- The `Team schedule` organizer marker is reserved for the existing activity-calendar bridge. Those entries stay in that existing editor and are excluded from discovery.
- Existing event IDs, team activities, fee locks, player records, role grants, and calendars are retained. No new migration, database connection, credential, registration, payment, email, or notification transport is introduced.

## Source honesty

The finder searches saved club records only. Demo clubs explicitly label sample events. No new tournament listings are seeded into production. Old `verifiedOn` values do not create verification badges or source-check claims. New optional `sourceUrl`, `sourceCheckedOn`, and `distanceMiles` fields are backward compatible with existing records. A source-check date requires an HTTPS source URL without embedded credentials and cannot be in the future. This means an office-recorded check, not independent or automated verification.

The outbound official directories below were verified October 19, 2026. They do not provide imported search results:

- USSSA baseball: https://www.usssa.com/baseball_events
- USSSA fastpitch: https://www.usssa.com/fastpitch_events
- Perfect Game: https://search.perfectgame.org/
- Five Tool Youth: https://play.fivetoolyouth.org/events

Any live feed, recurring refresh, source licensing, automatic alerts, or separate persistent shortlist requires a later integration decision. Current selections are on the actual team schedule and may be visible to families, not a private shortlist. Conflict warnings compare selected tournament catalog records; they do not certify that every game or practice is conflict-free.

## Existing fee-review limitation

The retained bulk selection save flow does not invalidate an existing fee-plan review status. Reading the fee workspace recomputes current automatic entry costs, and its view refreshes after a finder selection, but the prior reviewed/published status can remain. Signed player fees are separately locked and are not rewritten by the finder. Front Office should review schedule-dependent budgets before publishing; changing that existing review lifecycle is outside this UI/catalog patch. Referenced catalog event details are now protected so this feature cannot silently edit their historical fees or dates.

## Verification

- Unit/regression coverage: filters and date boundaries, missing/zero distance, costs, selections/conflicts, URL/date/source validation, optional metadata compatibility, no notifications, assigned-team isolation, coach catalog write protection, and scheduled-record protection including closed teams.
- Render coverage: role-appropriate editor visibility, accessible advanced filters, empty state, save success/failure, repeated pending clicks, safe external links, manual add/cancel.
- `scripts/check-tournament-finder.mjs` runs the real built app with authenticated synthetic users and disposable PGlite storage. It covers coach filtering/save/reload, owner add/save/reload, protected scheduled costs, editor focus/cancel, Back navigation, parent denial, mobile overflow, and application errors. Screenshots are synthetic fixtures, not live event or customer data.
- Required project checks: `npm run typecheck`, Netlify-targeted `npm run build`, `npm run verify:build`, `npm test`, `npm run lint`, and the existing CI checks. Check the PR for actual outcomes; this document is not itself a claim all checks passed.

No production publication is included. A deployment preview, if generated by existing hosting integration, must be checked for exact commit and isolated data before use. Real iPhone behavior, accessibility certification, live source accuracy, registration availability, and provider transactions are not certified by the local fixtures.
