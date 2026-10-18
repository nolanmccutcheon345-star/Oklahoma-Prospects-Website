# Coordinator access implementation and release gate

**Status: development implementation, NOT production activated. The full master directive is not complete. Do not merge or assign production coordinators until the remaining gates below pass.**

## Inspected baseline

Source baseline: `f11589ffe21e0b643f11ca5ba67331cc4150ddce` on `main` (PR #211).
Repository: `nolanmccutcheon345-star/Oklahoma-Prospects-Website`.
Netlify production site: `c49ad0ab-1b2c-412e-88d9-1f6ddf490a17`, primary origin `https://prospectssports.club`.
The requested legacy domain remains distinct from the canonical origin. Do not rename sites or alter domain configuration for this feature.

Read the repository engineering contract and existing full-system audit. Inspected authentication/session configuration, identity and owner resolution, authorization middleware, registration reader and tryout-center access, shared staff profiles/public directory, roster/club state, team activities/chat, tryout events/enrollments, training events/paid registrations, booking occupancy/checkout, database adapters/migration tooling, audit and notification services, and GitHub/Netlify release configuration. This is source inspection and isolated validation, not an inspection of every live account or every production row.

| Existing system | Observed architecture / extension decision |
|---|---|
| Authentication | Better Auth 1.6.x; bearer, generic OAuth, two-factor, existing platform bridge. Cookie session cache disabled. Verified email and disabled-account checks. No Better Auth organization/admin role plugin is installed. Retained without replacement. |
| Roles | `profiles` plus explicit verified `owner_grants`; independent team-coach and instructor assignments. Coordinator assignments are additive, not an expansion of `profiles.role`. |
| Owners | Existing seed authorizes Steve and Nolan. New dedicated staff authorities are seeded only from those existing approved owner-grant emails. No arbitrary admin label qualifies. Live owner accounts were not changed. |
| Registrations | `club_requests`, `office_request_work`, `office_request_notes`; legacy readers and tryout center are broad, not sport-scoped. New coordinator queries select narrow fields and explicit sport/team grants. Coordinators cannot use those broad reader endpoints; owners retain access. |
| Rosters | JSON in `club_state` contains medical, financial and operational fields together. New projections select operational fields in SQL; edits change only jersey number or positions and enforce the shared revision. No bulk payload save is exposed. |
| Scheduling | Team activities and legacy team practices coexist. New practice writer updates both in one transaction and uses existing `booking_records` / unique five-minute `booking_occupancy`. Linked cage practices cannot be edited through the old unsynchronized activity writer. |
| Payments | Square/commerce, membership/lesson/refund systems remain separately authorized. No coordinator capability accepts financial APIs or fields. A coordinator's separately verified parent/instructor/owner role is not created or removed by this feature. |
| Communications | Existing team chat and tryout email outbox reused. Team recipient confirmation and single-guardian email confirmation; no unrestricted contact export, raw recipient override, or program-wide mailing endpoint. |
| Audit | Existing append-only `audit_events` and owner notification pipeline retained. Dedicated coordinator audit captures scoped operations and safe metadata; mirrored summaries exclude message bodies and credentials. |
| Deployment | Native Netlify database integration with separate preview selection supported; production backup, actual preview isolation and migrations have NOT been verified in this change. |

## Implemented in this branch

### Authorization and administration

- Distinct generated identifiers `baseball_coordinator` / `softball_coordinator`.
- One account/sport assignment row; zero default permissions. Initial assignment rejects nonempty grants, forcing a separate deliberate grant save.
- Finite capability allowlist enforced by strict input schema and PostgreSQL constraint; no wildcard/preset can grant finance, medical records, staff administration, destructive exports/deletion or publication.
- Explicit sport-wide or selected-team coverage. Team scope comes from server records, with transaction locks protecting classification during operations.
- Active/suspended/removed status, optimistic revisions, immediate server revalidation, shared assignment locks during access and mutations.
- Owner-only `staff_roles.manage`, `staff_activity.read`, `staff_approvals.review`; verified owner grant is required in addition to the capability.
- Staff Management in the existing Front Office: account selection, two roles, scope, category checkboxes, proposed preset (not auto-saved), confirmation, revoke-all, suspension, effective saved grants, separate-role review, history and approvals.
- Existing broad registration-reader grants must be disabled before coordinator activation. Broad registration and tryout-center endpoints reject coordinator accounts; use the scoped workspace. This intentionally prevents legacy reader access from bypassing unchecked boxes.
- No production account, including Sara, was assigned a role or permissions.

### Operational workflows

- Minimal `/coordinator` landing without records/counts for zero-grant or suspended assignments.
- Scoped prospect/tryout registration viewing; create prospects; update routine age/position fields; status updates and notes; concurrency protection.
- Guardian contact projection only with separate `contacts.read` grant.
- Scoped roster viewing and separately granted jersey/position editing. No birthdates, addresses, medical or payment details are returned.
- Team schedule viewing, practice creation/rescheduling, available-cage reservation/change/release.
- Shared cage occupancy shows only resource/time, not customer identity or financial status.
- Database uniqueness enforces occupancy conflicts. Conflicts roll back practice, reservation and audit changes together. Only linked, unpaid practice reservations can be released.
- Existing team conversations, separately permissioned reading/posting, preview/recipient confirmation; individual guardian email queueing with frozen message and existing idempotent delivery.
- Delivery worker rechecks coordinator access and current intended recipient before dispatch. Revoked queued mail is skipped. An already dispatched external email cannot be recalled.
- Draft creation/submission and owner review. No public publishing capability is available.
- Nonfinancial scoped roster/recruiting counts and own activity projection.

### Public profiles and governance

- Public leadership settings independent of coordinator role assignment; title selection, visibility, order.
- Existing shared display name/photo/bio/teams reused; public directory deduplicates by existing identity and displays coach plus coordinator titles.
- Approval queue records actor, scope, target, proposed revision, reason, timestamps and decision.
- Practice cancellation approval executes atomically and releases only its linked unpaid reservation.
- Transfer and content approvals record the review decision; **they do not automatically transfer athletes or publish content**. Those remain owner workflow actions requiring eligibility/agreement/consent review.
- Coordinator audit is append-only for UPDATE, DELETE and TRUNCATE through ordinary application use. Audit details exclude credentials, medical records, payment details and message bodies.
- Existing owner activity pipeline receives minimized events; denied staff-administration attempts are classified as immediate, other coordinator activity as daily. Delivery depends on the existing separately configured notification service.
- Five-denial/24-hour review indicator is available in Staff Activity. This is a review signal, not a determination of a security incident.

## Database migration

`0066_coordinator_access.sql` is additive. Adds `staff_authorities`, `coordinator_assignments`, `coordinator_audit`, `coordinator_drafts`, `coordinator_approvals`, `coordinator_practice_bookings`, `public_leadership`; adds an intake revision and coordinator outbox actor; adds safe notification-access, audit mirroring and sign-in triggers. Creates no coordinator assignments and no operational grants. Generated Netlify migration is included.

RLS enabled with public privileges revoked on new tables. The existing private server connection can bypass RLS as table owner; this is **not request-specific row-policy enforcement**. Authorization is enforced in the application transaction. Do not describe these tables as independently isolated from a compromised privileged connection. An external audit copy and restricted runtime/migration principals remain rollout work.

## Validation evidence

- Three direct PostgreSQL/PGlite integration suites cover deny-by-default roles, unknown grant rejection in both schema and database, nonowner/fake-admin denial, cross-sport and team-ID attacks, field redaction, read-only mutation denial, stale revisions, revocation/suspension/disabled account checks, preserved private source fields, duplicate notes/email handling, recipient confirmation, scoped reports, public-title independence, cage conflict rollback, owner-only approvals and append-only audit.
- Final TypeScript check, Netlify-adapter build and built SSR verification passed. Dependency audit reports zero vulnerabilities.
- Full regression run: 926 tests, 925 passed, one form-submit failure. Fixed explicit submit types on the coordinator form buttons; both form-submission tests subsequently passed. Final combined coordinator and form run: 5 tests passed, zero failures. The entire 926-test suite has not been rerun after that correction.
- Expanded direct tests also enumerate every capability for zero-grant denial, explicitly granted dual-sport access, and queued-email suppression after suspension.
- SSR/build verification passed during development.
- Lint completed with zero errors; pre-existing warnings remain.
- Added authenticated built-app browser walkthrough and CI gate covering zero-grant landing, read-only recruiting/contact exclusion, owner revocation in an active session and owner-route denial.
- Local browser walkthrough could not execute: the Chromium download returned invalid/truncated archives and no installed executable was available. **Browser behavior is not locally certified.**
- No live charges, real emails, customer fixture records, production migrations or role grants were used for testing.

## Remaining requirements — release blockers, not completed features

1. Finish camp/clinic/tryout event create/edit, attendance and athlete assignment with nonfinancial DTOs, team scope and atomic cage integration. Existing training event schema requires pricing and coach assignments; do not pass coordinator data through the owner financial editor or fabricate prices.
2. Finish remaining individually grantable capabilities from the master directive: follow-up task assignment, attendance, roster eligibility/additions, roster openings/recruiting needs, statistics, program inquiries, scheduled notices/delivery status, detailed participation reports and draft editing controls. Unimplemented capabilities are not grantable.
3. Complete the coordinator invitation/acceptance flow with zero permissions. Normal verified accounts can be assigned now; never use a coach/admin invitation as a shortcut.
4. Complete transfer execution/recovery with approval-bound record versions, eligibility and financial-agreement preservation. Current approval records a decision only.
5. Complete administrator publication execution with current guardian-consent checks. Current editorial approval is not publication.
6. Configurable alert thresholds; owner-reviewed incident escalation; daily integrity checks, weekly/monthly reports and quarterly permission reviews. Current denial indicator and existing daily owner pipeline are only partial coverage.
7. Independently protected audit archive; audit/config tampering monitoring beyond normal application controls; recovery tooling; approved retention/deletion policy.
8. Finish audit of direct routes, exports, background jobs and multi-role combinations; test all legacy independent-role cases. Coordinator role alone grants no legacy staff access, but independently assigned staff roles need explicit owner review.
9. Run the new browser walkthrough and all required CI tests; review responsive screenshots, failure/error paths and authenticated endpoints. Validate actual iPhone behavior separately.
10. Verify live schema, approved owner identity resolution, database backup/recovery, isolated staging targets, staging migration and owner smoke tests. Never infer backup or isolation from a successful build.
11. Review actual youth signup/guardian flows for applicable privacy obligations; do not represent this implementation as legal certification.
12. Only after all release gates: merge through established GitHub/Netlify workflow, verify exact deployment commit and `/release.json`, run hosted verification, verify owners retain access, then permit owner-controlled activation.

## Privacy review

Source inspection found existing household/guardian checks, explicit publication consent and player-role restrictions, but not evidence sufficient to certify the site's age determination, direct parental notice, verifiable parental consent, or purpose-specific retention across all flows. New coordinator DTOs minimize fields and have no direct public publication or unrestricted export.

FTC's current guidance identifies notice, verifiable parental consent (where applicable), parental access/deletion, security and purpose-limited retention requirements. The FAQ explicitly notes the April 2025 amendments; use the amended rule when assessing this site's actual flows. References reviewed October 18, 2026:
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments

Before release, owners must approve retention purposes and periods for prospects, notes, communications and security events, and the guardian-verification/deletion procedure. Do not hard-delete customer records or invent a legal retention interval in a code migration.

## Owner steps for Sara — AFTER validated release

1. Sign in as Nolan or Steve; open Front Office → Staff & Access → Staff Management → Roles & Permissions.
2. Identify Sara's existing verified account by email, not display name alone. Review existing independent roles and disable any broad legacy registration-reader grant.
3. Choose Softball Coordinator. Choose explicitly authorized teams or all softball teams. Assign Role With Zero Permissions; confirm. This does not publish her profile.
4. Review individual checkboxes. The proposed preset only selects implemented permissions on screen; it does not save or activate them. Review any independent coach/instructor privileges separately.
5. Save Permissions and confirm the exact scope/count. No financial or medical capability can be selected.
6. Configure public coordinator title separately. Edit approved name/photo/bio in the shared staff profile; check the public All and Softball filters.
7. Have Sara sign in at `/coordinator`. Verify only approved modules appear and denied endpoints remain denied. Do not activate her before security validation.
8. Revoke All clears grants; Suspend blocks access but retains configuration for explicit reactivation; Remove clears this sport's grants. Review changes in Staff Activity.

## Delivery and deployment status

Source changes remain local. An empty remote review branch named `feat/coordinator-access` was created at the original baseline; it contains none of these implementation changes. No pull request was created. Automatic approval review rejected uploading the source changes and operational documentation to the public GitHub repository because explicit user approval for that disclosure is required. Netlify metadata confirms the existing production deployment references this repository and the inspected baseline, but that did not satisfy the approval review. Do not retry uploading until approval is supplied.

No feature deployment, production migration, new production backup, live role change or Sara activation occurred. Existing production deployment `6ad15aff3eb3f6b5850a09b2` was observed ready at the baseline commit; this is not deployment verification of the new feature.

The accompanying patch applies to the baseline commit above. It is a partial implementation for engineering review, not a production-ready release. The report's remaining requirements are release blockers.

## Account entry and historical access follow-up

The draft now adds a Coordinator Front Office link to the existing account page for active coordinator assignments, including zero-grant assignments. A parent account remains a parent for its independent household workflows. This link conveys no operational authority: every destination operation checks current grants. Suspended, removed and ordinary parent accounts do not receive the link.

Recruiting and team communications now use bounded keyset pagination with Older records and Newest records controls. There is no assignment-date cutoff. Tests cover 205 older registrations and 105 older messages, equal timestamps, no skipped/duplicate IDs, cross-sport denial, field redaction and revoked access on subsequent pages. Registrations with missing or incorrect sport classifications remain excluded until an owner reconciles the source data; that reconciliation has not been performed.

The first hosted CI run reached the coordinator browser check but failed with a PGlite socket portal concurrency error while opening owner management. The browser harness now serializes full dynamic requests to its single embedded database backend, preserving real authentication and authorization. It also exercises the account-to-coordinator link and ordinary-parent link exclusion. These harness changes require a fresh CI result before certification.

Final local targeted suites for this follow-up: 6 passed. Build, TypeScript and targeted lint pass. Chromium installation still fails locally. No production deployment or account assignment has been performed.
