# Tryout evaluations

Open **Coach App → Tryout evaluations** or **Front Office → Tryout results**. Both use `/evaluations` and the existing club login.

- Coaches can immediately enter a player under **General tryout / no team**, choose any age group and sport, and save a draft or submit. No team setup is required. Assigned teams remain an option; their age and sport come from the team record.
- Seven ratings use 1–5 or Not observed. A total out of 35 appears only when all seven are rated. Notes, drill setup, rep counts, throwing readiness, and follow-up details are optional.
- Owners can review drafts and submissions across teams and filter by player, team/age, sport, date, evaluator, and status. Refresh retrieves the latest saved results.
- Active coaches can view their own general tryouts and their assigned teams. Only the original evaluator can edit; team records additionally require a current team assignment. Owners can view every evaluation without changing another coach's attribution. Owners can select any registration for a general tryout; coaches can select registrations matching their assigned teams and otherwise enter the player name.
- Recommendations record the coach's judgment; they do not offer roster spots or send family messages. The downloadable baseball workout PDF remains fillable.

## Persistence and access

`0035_tryout_evaluations.sql` adds an audited table with independent evaluation rows. The generated Netlify migration is included. Existing sessions and `owner_grants` control access; coaches require an active `club_staff` record, with team assignments enforced for team evaluations. An empty `team_id` denotes a general tryout, visible only to its original coach and owners. Family/player and registration-reader access do not grant evaluation access. Candidate responses omit household contact details. Registered age and sport are resolved server-side.

Each evaluation carries a stable UUID and revision. Identical retries are safe; stale edits and changes of registered player/team are rejected. Submitted future dates are rejected. Closed-team results remain visible to owners.

This feature does not depend on the separate tryout-calendar/enrollment PRs and does not change their migrations or notification behavior.

## Verification

- `node --import tsx --test src/lib/tryout-evaluations.test.ts` checks the real migration with disposable PostgreSQL-compatible PGlite, staff/team and role boundaries, attribution, saved records, duplicate retries, stale revisions, registration matching, and scoring.
- `node scripts/check-tryout-evaluations.mjs` starts a local HTTPS server with disposable users and database, signs in through the real login, saves/reopens/submits on mobile, verifies results in a separate owner session, and checks parent denial. Requires Chromium and OpenSSL; `TEST_CHROMIUM_PATH` may point to an installed Chromium executable. It refuses configured database URLs or production environments and sends no email.
- Release gates also include typecheck, the full test suite, lint, high-severity dependency audit, Netlify build, built SSR verification, and browser checks of the built output.

PGlite tests establish transaction behavior in the disposable test database; they do not claim concurrent multi-connection PostgreSQL load testing.
