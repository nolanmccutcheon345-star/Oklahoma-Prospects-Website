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
| 4 Granular operations    | Prospect/tryout reads and status changes are separate; follow-up assignment, attendance, delivery history, team openings/needs and separate report grants are implemented. Roster additions/routine information, inquiries, expanded event attendance and scheduled communications remain.                                                                                                                  |
| 5 Permanent restrictions | Existing finite allowlist and narrow projections retained; blanket delegation retired. Full legacy regression gate remains.                                                                                                                                                                              |
| 6 Public staff           | Existing independent titles and publication controls retained; no automatic identity publication.                                                                                                                                                                                                        |
| 7 Coordinator office     | Existing scoped workspace retained. Missing operational modules still need implementation.                                                                                                                                                                                                               |
| 8 Authorization          | Server retirement regression added; no UI-only restriction. Full endpoint/export/job/multiple-role verification remains.                                                                                                                                                                                 |
| 9 Approvals              | Existing practice cancellation execution retained. Transfer execution/recovery implemented. Mass communication and publication execution remain.                                                                                                                                                                     |
| 10 Audit                 | Existing append-only coordinator audit retained. Independently protected archive and comprehensive coverage remain.                                                                                                                                                                                      |
| 11 Alerts/reviews        | Owner-configurable in-app denial thresholds and weekly/monthly/quarterly access-review attestations implemented. Scheduled daily/weekly/monthly/quarterly checks and transactional reviewer outbox implemented. Additional risk detections and live delivery validation remain.                                                                                                                          |
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

## Granular intake, reports and team operations

Migration 0084 adds capabilities without assigning them to any account. `recruiting.read` now returns prospects only; tryout registration read and status changes require their own grants. Background task recipients recheck the actual request kind. An old prospect checkbox cannot silently authorize tryouts. Existing roster-count reporting now returns only roster counts; recruiting, tryout, opening, attendance, event and follow-up metrics each require an independent grant. This is deliberately a reduction of bundled access, requiring owner review to enable additional fields.

Team openings and recruiting needs use separate optimistic revisions and capability checks. Team statistics expose final-game counts only. The new fields do not copy mixed historical financial notes or alter team financial records. Scoped jersey editing now rejects duplicate active jersey numbers, matching the existing owner workflow.

Validation: 16 direct coordinator security tests and a mounted team-operations test passed, including independent grants, cross-sport/team denial, stale edits, filtered fields and duplicate jerseys. Five migration upgrade/idempotency tests passed. Typecheck, Netlify build, built SSR, real authenticated compiled HTTP transition regression, and lint (zero errors, 101 existing warnings) passed. The preceding 41ebf938 source passed all seven browser walkthroughs and both PostgreSQL jobs; its full regression checks were still running. Final-head full CI remains required. No production changes or account activation occurred.

## Scoped camps and clinics

Migration 0085 adds six explicit event capabilities, authoritative team bindings and links to shared cage occupancy. No event or account is automatically assigned. Coordinators can create private camp/clinic drafts and edit unpriced drafts, schedule sessions, reserve available cages, assign only athletes with owner-reviewed current roster identity links, and record attendance through the existing waiver and date checks. Rescheduling updates coach/athlete/cage occupancy atomically. Existing paid or protected events cannot be changed through these endpoints.

Owner-reviewed cancellation captures event and session revisions and the actual team. Approval rechecks current requester permissions, rejects protected bookings, archives the event, releases future unpaid occupancy and audits in one transaction. Audit failure rolls back the approval and schedule. Event participation/attendance reports expose separately granted counts only. Public publication remains owner controlled; broader publication/change approvals and scoped tryout creation remain outstanding.

Validation: 24 scoped security/migration/mounted-interface tests and 13 existing owner booking/event regressions passed locally. Typecheck, Netlify build, built SSR, real compiled authenticated HTTP transition checks and lint (zero errors, 101 existing warnings) passed locally. Full final-source CI remains a release gate. Earlier source 41ebf938 passed both complete GitHub workflows, including all browser, regression, lint, audit and PostgreSQL checks. That is not a release receipt for newer code. No production changes or staff activation occurred.

## Scoped tryout schedules and reviewed changes

Migration 0086 adds independent tryout-create, tryout-edit and event-review permissions and authoritative event/team bindings. No existing event or account is automatically delegated. New tryouts are private drafts with shared coach/cage occupancy. Publication, published schedule changes and cancellation use the central owner queue; cancellation additionally requires its own request permission. Approval rechecks current grants, actual team, exact revision, enrolled-player classification and capacity. Conflicting paid reservations are never displaced. Schedule, appointments, occupancy, family notification outbox and audit changes commit together.

Team-bound tryouts are excluded from unrelated automatic enrollment. Scheduled requests derive their team from the selected bound event, reject conflicting preferences and retain existing public team/coach validation. Existing appointment editors preserve event-owned reservations when the last individual appointment is removed. Read DTOs contain schedule and active coach choices only.

Validation: 18 coordinator security integrations, 12 migration/existing tryout workflow tests, and seven mounted/button regressions passed. Typecheck, production build, built SSR, compiled authenticated HTTP checks and lint passed (zero errors, 101 existing warnings). Full CI at the new source remains required. The preceding 6cda source passed PostgreSQL and all browsers but failed the form-submission regression: two team-operation buttons lacked explicit submit types. That defect is fixed, all new form buttons are explicit, and mounted tests now click the real submit buttons instead of dispatching synthetic submit events. No gates were removed. No production changes or staff activation occurred.

## Event-time audit context and risk review

Migration 0087 records server-generated role/sport/team snapshots at action time and correlates related coordinator and established privileged audit entries by request ID. Historical entries remain immutable and are not rewritten with present-day roles. Owner filters cover actor, sport, team, dates, action, target and result, with older-page navigation. Established legacy activity appears as metadata only; private before/after narratives are not copied into the staff viewer.

Configurable risk checks flag unusual roster/contact volume, publication denials, repeated scheduling conflicts, restricted administration attempts and missing audit protections. They run independently of the morning summary, create append-only findings and transactional owner-only notices, deduplicate repeated runs and recheck recipient authority at delivery. Indicators require human review and never change permissions automatically. Protected external archiving and actual delivery verification remain release requirements.

Validation: 39 audit, security, policy-interface, migration, form and alert regressions passed. Seven follow-up audit/migration tests passed after extending request context to the established audit log. Typecheck, Netlify build, built SSR and compiled authenticated HTTP checks passed. Lint has zero errors (102 warnings, including temporary local test artifacts). No production migration, deployment or account activation occurred.

## Owner-reviewed camp and clinic changes

Migration 0088 extends the central queue with exact camp/clinic publication and session proposals. Requests require both the relevant edit grant and event-review grant. Approval rechecks current requester scope, event/session revisions, existing enrollment capacity and shared occupancy. Published changes cannot use the draft-save endpoint. Financially protected events remain blocked. Owners see the exact proposal before approval; request retries must match the original content.

Instructor updates now select the deterministic staff reservation instead of selecting any reservation at the same time, protecting independently reserved cages and athlete bookings. Tests verify cage occupancy remains unchanged while instructor occupancy changes. Approval/audit failure, current permission revocation, paid conflicts and stale requests are tested directly; the mounted interface requires confirmation and submits the actual scoped proposal.

Validation: 44 security, migration, owner booking, mounted interface and form regressions passed. Typecheck, Netlify build, built SSR and compiled authenticated HTTP checks passed. Source 8ea0973d passed PostgreSQL and all seven browser walkthroughs; its full application regression run is still in progress. No production changes or staff activation occurred. Communication delivery for all event types, remaining scoped roster/content/communication features and final release validation are still required.
