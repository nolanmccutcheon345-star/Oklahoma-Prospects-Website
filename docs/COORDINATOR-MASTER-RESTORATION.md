# Coordinator master directive restoration — October 20, 2026

Status: work in progress. This branch is NOT the completed 17-phase system and is NOT approved by its test results for production release.

The controlling requirement is the original master directive: two independently scoped coordinator roles, zero operational permissions at assignment, deliberate per-account finite grants, owner-only staff management, prohibited financial/security/medical/destructive capabilities, approvals and accountability. The subsequent organization-wide nonfinancial delegation requirement has been withdrawn.

## Immediate correction

- Retire organization-wide grants at the shared server authorization gate, including persisted active grants and existing sessions.
- Refuse new organization-wide grant requests, including direct server-function calls.
- Remove the blanket grant editor from Staff Management. Retain the original scoped role and checkbox editor.
- Preserve authentication, owner grants, existing records, financial basis history and financial restrictions. Do not reverse database migrations or financial cutovers blindly.
- No individual name, email, or account-specific authorization is introduced in production source.
- Live account-level revocation was handled through the authorized owner editor separately from code; private account details are intentionally excluded from this public repository document.

## Required completion matrix

| Phase                    | State / remaining work                                                                                                                                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Audit                  | Baseline and later broad-access source inspected; current owner workspace verified. Full route/job/independent-role audit remains.                                                                                                                                                                       |
| 2 Roles                  | Existing baseball/softball zero-grant assignments retained; scoped security suite passes.                                                                                                                                                                                                                |
| 3 Administration         | Existing grant, revoke, suspend, effective access and history retained; generic zero-grant invitations implemented with expiry, replacement, revocation, current inviter authority and verified-recipient acceptance; browser acceptance validated in GitHub CI; final-head full checks remain required. |
| 4 Granular operations    | Existing 26 capabilities retained. Remaining recruiting tasks, roster additions/openings, inquiries, event attendance, scheduled communications and reports require scoped integration.                                                                                                                  |
| 5 Permanent restrictions | Existing finite allowlist and narrow projections retained; blanket delegation retired. Full legacy regression gate remains.                                                                                                                                                                              |
| 6 Public staff           | Existing independent titles and publication controls retained; no automatic identity publication.                                                                                                                                                                                                        |
| 7 Coordinator office     | Existing scoped workspace retained. Missing operational modules still need implementation.                                                                                                                                                                                                               |
| 8 Authorization          | Server retirement regression added; no UI-only restriction. Full endpoint/export/job/multiple-role verification remains.                                                                                                                                                                                 |
| 9 Approvals              | Existing practice cancellation execution retained. Transfer execution/recovery, mass communication and publication execution remain.                                                                                                                                                                     |
| 10 Audit                 | Existing append-only coordinator audit retained. Independently protected archive and comprehensive coverage remain.                                                                                                                                                                                      |
| 11 Alerts/reviews        | Owner-configurable in-app denial thresholds and weekly/monthly/quarterly access-review attestations implemented. Scheduled integrity checks and external alert delivery remain.                                                                                                                          |
| 12 Privacy               | Narrow fields retained. Owner-approved retention/deletion procedures and actual guardian/privacy-flow review remain.                                                                                                                                                                                     |
| 13 Integrity/recovery    | Existing transactional practices/occupancy retained. Scoped event integration and recovery tooling remain.                                                                                                                                                                                               |
| 14 Testing               | Typecheck and six direct coordinator integration tests pass locally. Full regressions are being evaluated; broad-access positive tests must be reconciled with retired delegation while preserving owner-feature coverage.                                                                               |
| 15 Deployment            | No new production release from this branch. Required CI, isolated preview, backup/recovery and exact production verification must pass before release.                                                                                                                                                   |
| 16 Configuration         | No hardcoded individual grants. After validated release, owners explicitly select permissions for the verified existing account. No automatic preset activation.                                                                                                                                         |
| 17 Delivery              | This is a truthful interim record, not a completion certificate.                                                                                                                                                                                                                                         |

The older implementation report contains historical rollout observations. It must not be interpreted as current deployment or full-feature completion evidence. The original missing features are still release blockers; retiring blanket access does not complete them.

## Invitation and regression increment

- Reuses the existing invitation records and `/invitations` acceptance page. No database migration, account seeding, password management or automatic permission grant is introduced.
- Only current `staff_roles.manage` owners can create, list or revoke coordinator invitations. Acceptance rechecks that authority and the recipient's verified identity. Existing assignments (including removed ones), player accounts and unreviewed independent roles cannot be overwritten through acceptance.
- Acceptance preserves the base profile role and creates empty permission and team arrays. Invitations do not send email automatically; the interface accurately provides the recipient instructions.
- Nine scoped coordinator/security integration tests and four retired-access boundary tests pass locally. Typecheck, Netlify build and built-server smoke checks pass for the invitation implementation. Local Chromium installation failed, so browser results must come from the required CI walkthrough; no local browser pass is claimed.
- Surviving organization domain regressions are being moved to genuine owner callers; persisted blanket-grant callers remain negative authorization cases. Financial-basis concurrency checks now exercise explicit scoped grants and owner operational writes instead of withdrawn blanket activation.
- Full regression reconciliation and the remaining matrix items above are still required. This increment is not production-ready and does not activate any staff account.

## Database delivery retirement

Migration `0080_retire_blanket_delivery.sql` replaces only the queued-message authorization function. An old active organization-wide grant no longer authorizes pending recruiting email delivery. Current granular sport/team grants still require both contact access and recruiting-send permission; current verified owners retain their existing path. Sticky financial restrictions remain fail-closed. No grants, accounts, messages, financial rows or historical records are deleted or activated.

At commit `c56155d39ec2e85d5ec034aac3abfae51ed5bc8d`, GitHub passed the coordinator browser walkthrough (including zero-permission invitation acceptance), both tournament walkthroughs, and both real PostgreSQL financial/scoped-grant concurrency jobs. The later delivery migration must pass its own full checks; these earlier passes are not a release receipt for newer source. Full regression and master-directive feature completion remain outstanding.

## Owner-only regression reconciliation

The content, people, lesson assignment, facility assignment, instructor onboarding and tryout tests now use verified owners for surviving administrative operations. Persisted blanket accounts remain explicit negative cases, including active records, classified/public narratives, queued work and immutable financial snapshots. Obsolete partial-access scenarios are consolidated into denial matrices; owner domain validations and public privacy invariants remain exercised.

Local results for this increment: 26 targeted people/lesson/instruction/tryout tests and 10 content tests passed. Typecheck passed. Full application regressions are running; no full-suite pass or production readiness is claimed. The local Node 24 runtime uses `--liftoff-only` for PGlite stability; required CI gates are unchanged.

At remote source `df7f6b553b8090c393f06769703e23ba30e085f3`, both real PostgreSQL jobs and all seven browser walkthroughs passed. Full regression, lint and dependency checks must finish for the eventual release source.

Additional migration review requirement: former blanket accounts retain sticky financial isolation. Their transition to a granular coordinator workspace and approval/delivery paths must be verified explicitly before activation; deleting financial restrictions is not an acceptable shortcut. This remains part of the release-blocking authorization audit.

## Access review and financial regression increment

Owner-only Access Reviews records an attestation of the exact current assignment revision, scoped permissions and independent roles in the append-only audit log. Changes to assignments immediately make old reviews due again. Weekly/monthly/quarterly review intervals and denied-action alert thresholds are configurable with optimistic concurrency and dedicated owner authority. Reviewing access or changing review policy never grants, renews, or revokes access. Email reminders and scheduled integrity jobs are not implemented by this increment.

The latest uploaded predecessor regression suite reported 1,246 passes and three failures caused by withdrawn blanket-role expectations. These three financial regression files now test denial of retired blanket callers and genuine owner operations while retaining unchanged-financial-output assertions; all 24 tests passed locally. Ten coordinator security tests, three review interface tests, typechecking, production build and built-server smoke passed locally. Full regression rerun is in progress; no full-suite or final-release pass is claimed. No staff account was activated and no production deploy was performed.

## Explicit access withdrawal

A dedicated owner action now withdraws both sport assignments in one transaction, empties permission/team arrays, retires any historical blanket grant, rejects pending coordinator approvals and supersedes pending/processing/review coordinator email notices. It preserves base profiles, owner accounts, financial restriction flags and sent-message history. It requires an exact snapshot of both assignment revisions and the historical grant revision, a reason and confirmation; a stale review or failed audit rolls back the entire withdrawal. Already accepted provider messages cannot be recalled.

The server rollback/authorization test and mounted confirmation/refresh interface test pass locally. This is a withdrawal control, not automatic reactivation or completion of the former-account transition. Granular reactivation while preserving sticky financial isolation remains a release blocker. No customer account was changed by these synthetic tests.

## Explicit granular transition after withdrawal

Migration 0081 adds a reset-generation marker for drafts and database authorization helpers. A former blanket account cannot use retained scoped assignments until an audited owner withdrawal matches the current retired-grant revision. Withdrawal empties both sport grants; owners must then explicitly grant the chosen capabilities. Any later legacy-grant revision invalidates that transition. Financial restrictions remain intact, including owner-facing financial request denial. No identity or permission is seeded.

Historical recruiting records remain available under current authorized sport/team scope. Historical draft narratives from before withdrawal remain hidden; only drafts created under the current reset generation may be listed, edited or approved. The queued-message authorization function independently checks current readiness and scoped contact/send grants.

Validation: 23 targeted coordinator security, boundary and communication tests passed, including old-assignment denial, exact withdrawal, explicit regrant, historical recruiting visibility, cross-sport denial, permanent financial denial, hidden old drafts, new-draft approval and reset invalidation. Five migration upgrade/idempotency tests passed. Lint reports zero errors (101 existing warnings). The prior local full regression completed with 1,254 passing tests, but preceded this transition and is not a receipt for the final source. The browser walkthrough now covers withdrawal and explicit regrant; final-head CI and preview verification are still required. All remaining master-directive matrix items remain release blockers.

## Recruiting workflow and transfer execution

Three new capabilities are independently grantable: follow-up assignment, tryout attendance, and the sender's recruiting-delivery history. They are not added to existing grants or presets. Follow-ups accept only currently authorized assignees, use exact revisions, and preserve registration status. Attendance requires a separate grant even when recruiting-status editing is enabled. Delivery history excludes addresses, correspondence and other senders. Migration 0082 extends the finite allowlist and rechecks internal reminder recipients; queued retries cannot survive permission withdrawal.

Owner-approved transfers now execute atomically through the existing roster executor, retaining eligibility, duplicate-jersey, financial-commitment and revision safeguards. Owner-only recovery reverses the transfer only after those same checks and a confirmed current preview. Failed validation leaves the original records and approval unchanged; successful recovery is audited and cannot be replayed.

Validation for this increment: 33 targeted coordinator, owner-roster, tryout and migration tests passed; an additional reminder transport/revocation regression passed after tightening the recipient check. Three mounted interface tests passed for default-deny controls, duplicate-submit prevention, stale errors and confirmed transfer recovery. Typecheck, Netlify build and built-server SSR verification passed. The predecessor 06db356 passed both PostgreSQL jobs but failed the coordinator browser locator; this increment fixes the explicit Coverage label and opens the recruiting permission category before checking it. Required final-head browser/full-regression checks remain outstanding. This is not a production release or a completed master directive.

## Reviewed coordinator transport and scheduled reports

The 2539b9b browser run found a real transport failure: the default legacy middleware rejected former blanket accounts even after audited withdrawal and explicit scoped regrant. Reviewed coordinator endpoints now use verified-session middleware plus current active scoped readiness; their domain transactions still check the exact capability and actual record scope. Legacy mixed-data and owner endpoints retain their existing gate. Financial restrictions are preserved.

The compiled HTTP regression now exercises actual sign-in, owner withdrawal, zero-grant assignment, explicit team-scoped regrant, private-contact omission, cross-sport denial, financial and staff-management denial, and same-session suspension. This passed locally without Chromium. It does not replace the required browser walkthrough.

Migration 0083 adds append-only scheduled review receipts. The authenticated production worker creates daily integrity checks, weekly activity summaries, monthly management summaries and quarterly access reports, with a transactional owner-notification outbox. It checks retained disabled-account grants, invalid team scope, retired blanket grants, audit triggers and configurable repeated-denial thresholds. Reports never grant permissions; recipient authority is rechecked before delivery. Owner UI distinguishes an absent receipt from a completed check. Independently protected external archival and additional risk detections remain release blockers.

Validation: 33 targeted security, migration, mounted review-interface and alert tests passed; typecheck, Netlify build, built SSR and lint (zero errors, 101 existing warnings) passed. No live inbox delivery, production migration, deployment or staff activation is claimed. Full CI must pass at the new source, and the remaining completion matrix still applies.
