# Parent Team Hub release

The approved stadium design is now an authenticated `/team-hub` route in the existing academy application. It uses the academy account and current roster/household assignments; the ChatGPT Site remains the private design reference.

## Parent handoff

Send the existing roster invitation to its listed guardian, using the existing reviewed email workflow. The invitation now includes the production Team Hub link and the steps to verify the invited email and accept access. Account, enrollment guidance, and invitation acceptance also link to the hub. A new account or tryout inquiry alone never grants team access. An unlinked account gets invitation/setup/help links rather than sample records.

This change does not send an email, drain a queue, enable scheduled delivery, or replace the owner review controls released in PR #251. Reviewed invitation snapshots include the current Team Hub wording; existing provider request snapshots remain unchanged. Availability of outbound invitations is separate from the hub release.

## Behavior

- Current team announcements and new saved hub posts appear in the bulletin. Acknowledgments persist per account, and changed legacy announcement content requires a new acknowledgment.
- Schedule reads existing team activities and legacy practices. Attendance replies persist per player/event. Parents can reply for their linked children; assigned coaches and owners can reply for the roster. Parents never receive other households' responses.
- Team conversation uses the existing team chat table, including current targeted coordinator-notice visibility rules. Family conversations use a separate table scoped to team, athlete, and current household. Adult-to-player direct messages are not exposed.
- Private roster projection contains player names/numbers only. No financial obligations, date of birth, parent contacts, medical data, or staff notes are returned.
- Every read/write checks verified active account, current household links or active coaching assignment, and current team state. A coordinator enrollment grant alone does not grant hub messaging access. Reassigned households cannot read previous household conversations.
- Message/post retries retain their request ID; conflicting retries cannot overwrite existing records. UI loading, error, retry, saved feedback and 20-second refresh are included.
- Hub posts and messages do not produce phone, text, or email notifications. The interface states this. Messages show the latest 100 records; older records are retained. Coach event editing stays in the existing Coach workspace, preserving cage-reservation and financial checks.

## Verification and release

Acceptance checks cover multiple teams, out-of-scope requests, unverified/disabled accounts, inactive coaches, changed assignment, duplicate writes, persistent acknowledgments/messages/RSVPs, and minimal projections in isolated PGlite fixtures. The invitation transport fixture verifies the canonical production link. A real built-app browser walkthrough covers phone/tablet layout, sign-in, private chat, coach posts, persistence after reload, and unlinked account guidance. It is part of required CI.

Before merge: required CI, exact preview release identity, typecheck, build, SSR verification, lint and full regressions. After merge: exact Netlify production commit and release manifest plus hosted smoke checks. No customer accounts, live payments, or actual recipient sends are used for testing.
