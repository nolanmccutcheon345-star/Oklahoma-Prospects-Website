# Handbook and enrollment implementation

User authorized three releases on October 24, 2026. Preserve all published prices, fee calculations, Square reconciliation, historical agreements and existing role boundaries.

## Release 1: versioned handbook and team standards

Add a public searchable handbook reader and printable version, owner policy editor, team-scoped coach/coordinator drafts and owner approval. Published versions are immutable and optimistic concurrency prevents overwrites. New coordinator capabilities default to ungranted. Import the supplied policy framework as owner-prepared drafts; do not represent unperformed legal or insurance review as completed.

Minimum development feedback is one documented in-season update plus a final evaluation. The handbook references the actual published financial agreement, never fixed program prices or a new contingency basis. Steve is the proposed initial safety contact, with Nolan as alternate for concerns involving Steve. Reachable contacts and external reviews must be recorded before signature activation.

## Release 2: guided enrollment and verified payments

Add one baseball and one softball pilot, version-bound packet signatures, guardian/athlete identity checks, required-document readiness and separate optional media consent. Reuse the existing fee-acceptance and Square team checkout. Payment status comes only from verified provider outcomes; a redirect or signature cannot establish payment. Preserve original agreements on later policy changes.

## Release 3: season follow-through

Add absence notices and coach acknowledgment, development checkpoints and first-30-day tasks. Separate restricted medical/safety information from routine operational enrollment and attendance. Keep the organization rollout disabled until both pilot reviews pass.

## Acceptance criteria

- Owners alone publish policy/standards and configure rollout. Fake admin profiles confer no authority.
- Coaches are limited to assigned teams; coordinators require explicit sport/team permissions. No financial fields or exports in operational responses.
- Guardians see and sign for their linked athletes only. Players cannot impersonate guardians.
- Old document versions and financial obligations remain unchanged.
- Publishing requires complete team standards; signature activation additionally requires review evidence.
- Synthetic baseball/softball flows cover enrollment, payment failure/success/refund, absence handling, development feedback, checklist completion and revoked access.
- Required typecheck, build, SSR verification, regression, browser, lint, dependency and exact-deploy checks remain enforced.

## Evidence limits

No real family is contacted, enrolled, signed for, or charged by testing. Synthetic provider responses are not a real Square transaction. Legal/insurance reviews and a real staffed pilot are separate from automated verification.

## Implemented routes and launch order

1. `/handbook` is the public, searchable, printable reader. `/handbooks` is the authenticated editor with immutable published versions and effective dates. Steve/Nolan publish; assigned coaches and explicitly permitted coordinators draft team standards. The imported master, baseball, softball and emergency authorization documents begin as unpublished drafts.
2. `/enrollment` uses existing accounts, households, roster identities, fee acceptance, annual waivers and Square checkout. An owner chooses exactly one baseball team and one softball team and sets the season identity. Signatures stay closed until the effective packet is complete, contact details and the emergency-plan reference are recorded, and the owner attests that named legal and insurance reviews cover the exact published content.
3. The same workspace contains attendance notices, staff acknowledgments, actual attendance, development checkpoints, first-30-days tasks and optional guardian-authorized travel contacts. Attendance reads existing team activities, legacy practices and assigned tournaments; writes preserve the existing team attendance store. Checkpoints require an explicit roster-to-athlete link and may reference that athlete’s completed assessment. They never mark lessons or development assignments complete.

## Decisions retained from the existing system

- The imported packet does not set the program fee to $100. Actual owner-published team configuration remains authoritative, including retained overrides. The deployed $80 default, program-fee placement outside contingency, current installment schedule and published dates are unchanged.
- New pilot fee acceptance requires the current guardian packet acknowledgment. Previously accepted fee locks, payment plans and signed versions are retained. Publishing a handbook does not amend a financial agreement.
- Clearance is separate from a signature or a payment redirect. Steve/Nolan review the medical requirements and can clear only a currently signed, linked, waived enrollment with an accepted financial agreement and sufficient reconciled production Square funds or existing approved credits. The order must match the agreement’s locked date and stable agreement identity, where present. Sandbox, pending, unreconciled and different-agreement payments cannot qualify. Refunds reduce verified funds and remove recorded clearance for owner review.
- Cage, lesson and membership cancellation terms remain separate from seasonal team withdrawal terms. The draft specifies an ownership review for team cancellation/replacement and preserves the signed contract and applicable rights; external reviewers must approve the exact wording before signatures open.
- Development minimum: at least one in-season update (or the higher team requirement), plus a final evaluation. Baseline is recommended. Planned attendance notice: at least 48 hours for practices and 14 days for tournaments; emergencies are not automatically penalized.
- Optional photos/video permission is a separate opt-in with a withdrawal history. Neither enrollment completion nor this permission enables public roster/recruiting publication. Existing publication controls remain in force.

## Access boundaries

| Account                                     | Allowed                                                                                                                  | Withheld                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified current owner                      | Publish policies, configure pilot, financial review/clearance, restricted records, review rollout                        | Safety reports concerning that owner route to the alternate                                                                                        |
| Scoped coordinator with `enrollment.read`   | Authorized teams’ operational completion and progress                                                                    | Financial values, balances, budgets, payment details, exports, medical payloads, safety reports, private evaluation narratives and travel contacts |
| Scoped coordinator with `enrollment.manage` | Start authorized enrollment cases, acknowledge notices, record attendance, confirm staff checklist tasks                 | Guardian signatures, financial clearance and the restricted records above                                                                          |
| Assigned coach                              | Assigned-team statuses, notices, attendance, feedback and operational follow-through; draft standards                    | Financial administration, medical payloads and restricted safety reports                                                                           |
| Linked guardian                             | Own athletes’ packet, signatures, medical submissions, optional consent, notices, travel contact and own financial steps | Other households’ records and owner actions                                                                                                        |
| Linked player                               | Own permitted statuses, documents and development feedback                                                               | Guardian signatures, medical submission and financial administration                                                                               |

No coordinator permission is granted automatically. Current suspensions and revocations are checked on each server operation. Required `standards.draft`, `enrollment.read` and `enrollment.manage` permissions are additive options in the existing permission editor.

## Actual pilot acceptance

For each chosen team, observe at least one real cleared enrollment for 30 days. Complete guardian uniform/schedule tasks and staff orientation/goals/day-30 tasks; record actual development feedback, an acknowledged attendance notice and actual attendance. Record coach/family feedback, permission verification and resolution evidence in the owner pilot review. The expansion endpoint rechecks that evidence before accepting the organization rollout decision.

Both sports must pass before any additional team can be activated. Each additional team still requires its own complete, reviewed packet and explicit owner signature activation. Withdrawing either pilot approval returns rollout to pilot mode and closes additional-team signatures while retaining records.

## Verification and release restrictions

The synthetic fixtures exercise both sports, stale versions, unauthorized identities, financial separation, optional consent withdrawal, Square reconciliation/refunds, notice handling, checkpoint ownership, checklist authority, pilot timing and expansion gates. The browser walkthrough runs the real built application with disposable users/database and inspects mobile layout and response privacy. Its CI check is additive; existing checks remain required.

As of local implementation, no real pilot has been selected, no legal/insurance review has been attested, and no family has been signed, charged or contacted. Live deployment, exact Netlify commit verification and the actual pilot remain outstanding. Automatic approval review blocked publishing this organization-specific implementation to the public repository; explicit user authorization for that disclosure is required before a push or public PR.
