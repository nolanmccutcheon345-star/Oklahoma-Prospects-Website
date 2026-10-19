# Organization-wide nonfinancial operations: implementation review

## Release status

This branch is a **staged implementation, not a completed production grant**. Migration 0067 creates an empty access table. It does not change Sara's account, existing coordinator assignments, Steve's owner role, or any production data. Do not activate the new role until the remaining workflow implementation and release verification are complete. Activating the replacement early would withhold some workflows Sara currently uses.

## Reference and access model

Production was inspected read-only: Steve has active owner/admin access plus instructor status; Sara has an active parent account with the existing softball-wide 26-capability coordinator assignment. Steve's access is not a coordinator preset.

The new organization operations grant is separate from owner/admin identity and tied to an existing verified account ID. It includes a persistent financial restriction. Default authenticated legacy endpoints, alternate payment authentication, identity-based service functions, and authenticated fundraising checkout/receipt paths deny this restricted identity. Only reviewed operational endpoints opt in. Unknown/new legacy endpoints remain denied. Suspension/revocation does not silently restore household finance access.

All operational DTOs reconstruct explicit fields, including nested records. Financial, mixed narrative, provider, funding and raw document fields are not serialized. Operational CSV exports construct new columns and escape spreadsheet formulas. There is no permission editor for the new role. No owner login is shared and no account is duplicated.

Public catalog prices and other information already published to anonymous visitors remain public. This boundary protects private authenticated financial information; it cannot make public information invisible to one person.

## Implemented operational surfaces

- Organization-wide team switching and strict team/player/staff/guardian-contact/checklist projections
- Team and roster operational create/edit, subject to protected financial coupling checks
- Recruiting registration operational fields, follow-up assignment/status, structured evaluation ratings and review
- Team schedules and practice facility occupancy/reservations, subject to protected financial coupling checks
- New confirmed team messages; no unclassified historical message bodies
- Confirmed recruiting guardian email with current-recipient binding, idempotency and queue-time authority checks
- Own classified operational drafts and submission for editorial review, plus allowlisted own activity
- Safe lesson assignment lists and instructor choices; actual instructor changes remain owner-only until compensation identity is separated
- Existing tryout event management and enrollment projections, preserving capacity/consent/notification safeguards
- Staff public-directory listings; unpublished historical biographies withheld and preserved
- Service facility lane assignment, without prices or compensation
- Game score and batting-stat updates through a separate operational saver, without schedule/budget recalculation
- Roster, registration, schedule and evaluation CSV exports
- Restricted accounts route from the account landing page to the operational workspace

## Not full nonfinancial parity yet

These remain explicit gaps, not successful acceptance criteria:

- Historical communication/note/narrative content and document files require classification or safe operational copies. Checklist flags alone are not full document access.
- Financially coupled roster additions/transfers/withdrawals, guardian billing identities, compensated staff or lesson-instructor reassignments, season changes and fee-linked event changes require separation of operational identity from financial attribution.
- Player development/curriculum administration, camps/clinics administration, broader service-catalog metadata, account lifecycle and global instructor-profile administration need reviewed operational APIs and UI integration.
- Tournament Finder requires a nonfinancial projection; its current mixed payload includes entry/travel costs.
- Broad website/portal settings, consent-aware publishing and administrative approvals have not all been ported.
- All current scoped coordinator workflows must be verified in the compiled browser walkthrough before switching Sara away from that workspace. Queued/provider-accepted email is not proof of delivery.

A passing test of the new surfaces does not establish parity for these unimplemented workflows.

## Required financial decoupling implementation

The present application computes some financial outcomes from editable operational records. Preserving dollar-valued JSON fields does not preserve those outcomes.

1. **Roster vs billing membership.** Persist the existing player/season financial agreement and fee-plan association independently from current roster placement. Migrate existing associations without recalculation. Operational transfers alter only roster membership. Finance uses the persisted agreement association.
2. **Contacts vs billing authorization.** Separate operational guardian/contact records from billing-authorized household identities. Contact edits do not grant or revoke financial visibility. Financial authorization remains owner-managed.
3. **Coaching vs compensation.** Persist effective-dated compensation/payee assignments independently from team coaching labels and staff-array counts. Operational coaching assignments do not rewrite accrued wages or splits.
4. **Schedule vs commitments.** Keep event financial commitments and hotel/refund policy snapshots independent of operational dates/status. A schedule change can flag owner review without changing amounts or creating refunds.
5. **Document classification.** Default historical mixed content to unclassified; owners explicitly classify operational content or create financial-redacted copies. Only classified operational content is visible/downloadable in the nonfinancial workspace.

**Decision resolved:** The user confirmed that operations must not change finances and that Steve and Nolan retain financial visibility. Operational roster, coaching, guardian and schedule changes must leave existing billing responsibility, compensation agreements and financial commitments unchanged until an authorized owner separately updates them. Remaining work is the cross-cutting implementation and verification below, not another business decision.

This requires additive migrations, backfill validation against current records, dual-read comparison of owner finance before switching, rollback planning and end-to-end tests. Steve's existing financial results must remain unchanged by the migration. No production financial records should be exported into test fixtures.

## Activation and verification gates

- Finish or explicitly accept the remaining parity gaps; preserve existing Sara grants until replacement workflows are validated.
- Obtain action-time approval for the exact persistent access expansion on the verified existing account.
- Validate typecheck, lint, backend tests, build and built SSR check, isolated authenticated walkthrough, preview exact commit and required CI.
- Test financial canaries through real server-function requests and direct routes, not only menu visibility.
- Test both sports, future teams, self/owner privilege changes, stale writes, disabled/unverified/suspended identity, financial side effects and Steve regression.
- Only then activate the account-specific grant and invalidate old sessions. Confirm the deployed commit and live release receipt; use read-only account inspection afterward.
