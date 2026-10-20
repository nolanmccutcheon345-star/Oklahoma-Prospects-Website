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

| Phase                    | State / remaining work                                                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Audit                  | Baseline and later broad-access source inspected; current owner workspace verified. Full route/job/independent-role audit remains.                                                                                         |
| 2 Roles                  | Existing baseball/softball zero-grant assignments retained; scoped security suite passes.                                                                                                                                  |
| 3 Administration         | Existing grant, revoke, suspend, effective access and history retained; zero-grant invitations still needed.                                                                                                               |
| 4 Granular operations    | Existing 26 capabilities retained. Remaining recruiting tasks, roster additions/openings, inquiries, event attendance, scheduled communications and reports require scoped integration.                                    |
| 5 Permanent restrictions | Existing finite allowlist and narrow projections retained; blanket delegation retired. Full legacy regression gate remains.                                                                                                |
| 6 Public staff           | Existing independent titles and publication controls retained; no automatic identity publication.                                                                                                                          |
| 7 Coordinator office     | Existing scoped workspace retained. Missing operational modules still need implementation.                                                                                                                                 |
| 8 Authorization          | Server retirement regression added; no UI-only restriction. Full endpoint/export/job/multiple-role verification remains.                                                                                                   |
| 9 Approvals              | Existing practice cancellation execution retained. Transfer execution/recovery, mass communication and publication execution remain.                                                                                       |
| 10 Audit                 | Existing append-only coordinator audit retained. Independently protected archive and comprehensive coverage remain.                                                                                                        |
| 11 Alerts/reviews        | Configurable thresholds, scheduled integrity and periodic review workflows remain.                                                                                                                                         |
| 12 Privacy               | Narrow fields retained. Owner-approved retention/deletion procedures and actual guardian/privacy-flow review remain.                                                                                                       |
| 13 Integrity/recovery    | Existing transactional practices/occupancy retained. Scoped event integration and recovery tooling remain.                                                                                                                 |
| 14 Testing               | Typecheck and six direct coordinator integration tests pass locally. Full regressions are being evaluated; broad-access positive tests must be reconciled with retired delegation while preserving owner-feature coverage. |
| 15 Deployment            | No new production release from this branch. Required CI, isolated preview, backup/recovery and exact production verification must pass before release.                                                                     |
| 16 Configuration         | No hardcoded individual grants. After validated release, owners explicitly select permissions for the verified existing account. No automatic preset activation.                                                           |
| 17 Delivery              | This is a truthful interim record, not a completion certificate.                                                                                                                                                           |

The older implementation report contains historical rollout observations. It must not be interpreted as current deployment or full-feature completion evidence. The original missing features are still release blockers; retiring blanket access does not complete them.
