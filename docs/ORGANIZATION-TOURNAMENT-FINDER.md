# Organization operations: nonfinancial Tournament Finder

This is an isolated adapter for the organization operations role. Existing owner and coach Finder contracts, authorization, catalog saves, financial calculations, and data remain unchanged. No role grants, provider calls, imported listings, registration, notification, or financial mutations are introduced.

## Reviewed entrypoints and boundaries

- Existing `office-workspace.tsx` and `teams/coach-app.tsx` use `TournamentFinder` with a whole `ClubRecord` and `saveTeamsClub`. The legacy default auth boundary remains closed to financially restricted accounts.
- `OrganizationTournamentFinder({ onSaved? })` in `components/coordinator/organization-tournaments.tsx` loads its own limited workspace; it accepts no whole club or legacy save callback.
- `getOrganizationTournaments`, `saveOrganizationTournamentSource`, and `getOrganizationTournamentReport` use `operationalAuthMiddleware`. Each server handler calls `requireOrganizationOperations` inside `secured` and accesses data in that same transaction. Revoked, suspended, unverified, disabled, and forged admin accounts cannot read, export, or edit.
- The response explicitly rebuilds event and team rows, arrays, and scalar types. It omits fees, travel budgets, lodging obligations, private notes, historical `verifiedOn`, roster/payment data, and unknown properties. Activity-calendar bridge entries and closed/unsupported teams are excluded.
- Organizer URLs are limited to the existing official directory URLs and known USSSA/Perfect Game public event routes with one numeric event identifier. Credentials, fragments, arbitrary hosts/paths, duplicate parameters, and all other query fields are rejected. Unsupported historical URLs/check metadata are withheld; their original values remain stored. Their editor stays disabled until owner review.
- The same allowlisted projection drives server CSV output, with fresh transactional authorization and explicit columns. Formula-leading cells are quoted and neutralized; no general object serialization is used for exports.

## Supported workflows

Across active baseball and softball teams: search saved event/organizer/city records, age/state/division/type/date-overlap filters, selected-team schedule filtering, recorded distance filter/sort, event metadata, selected-event indicators, and catalog-date-overlap warnings. Switching teams resets sport, age, season, and other filters. The UI has separate loading, error, empty, success, and protected-workflow states.

The source editor accepts only public URL, source-check date, recorded distance, event ID, and club revision. It locks the club, rejects stale edits and ambiguous IDs, preserves every non-source payload field and financial table, and returns only revision/change status. Invalid legacy source metadata cannot be silently overwritten. A source check is office-recorded, not an automated verification.

A repository-wide `distanceMiles` reader audit found only Finder display/filter/sort and type/fixture uses, with no financial engine consumer. Source metadata edits are covered by financial snapshots plus unchanged fee calculations, full/PO quotes, published player fee, automatic schedule costs and deadline checks.

## Explicit remaining gaps

- Creating an event, changing event identity/dates/eligibility, or adding/removing schedule selections remains an owner workflow. Existing `tournamentIds` drive automatic entry costs (`travel-budget.ts`), legacy pricing (`engine/02-pricing.js`), and payment deadlines. Even a zero-cost selection can affect a deadline. This adapter does not call those mixed financial saves or create fictitious zero-fee records.
- Cost/lodging filters and sorting, historical notes and unclassified source links are intentionally unavailable here. Supporting additional organizer URL formats requires a reviewed public route shape, rather than loosening the URL boundary.
- Conflicts compare catalog selections only, not every game/practice. Distances are manual estimates, not GPS. External directories do not import a feed. Catalog record text is operational metadata; this does not constitute an independent event accuracy review.

## Verification

- `node --import tsx --test src/lib/coordinator/organization-tournaments.test.ts`: projection canaries, nested/malformed data, private URLs, both sports and filters, CSV injection, revoked and forged-role denial, stale/repeated/invalid writes, preserved financial state/output, and rollback.
- `node --import tsx --test scripts/organization-tournaments-render.test.mjs`: JSDOM team/filter switching, explicitly labelled controls, protected actions, invalid URL rejection, cancel, failed/repeated save, export failure and revoked reload clearing.
- `node --test scripts/check-organization-tournaments-ui.mjs`: standalone synthetic Chromium companion, including actual accessible-name lookups and CSV download. It blocks all external requests. Locally not executed successfully because Chromium socket creation is restricted and elevated execution fails during environment setup. This is a pending browser check, not a passing browser result.
- Focused lint and project typecheck are separate from release gates. Parent integration owns aggregate build/SSR verification, full regression suite, preview review, and any authorized publication. No production change is part of this adapter.
