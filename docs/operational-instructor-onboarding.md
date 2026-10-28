# Bounded operational instructor onboarding

## Scope

An existing verified organization operator or genuine owner can grant or suspend a separate operational instructor assignment for another existing, verified, enabled, provisioned non-player account. The grant has its own revision and audit reason. Owner/admin accounts and the actor's own account are protected. No new account, invitation, credential, authentication email, base role, commercial staff record, or instructor flag is created or modified.

The command and consumers require the reviewed active financial basis. Captured-only and legacy financial states remain fail-closed. This change does not activate financial cutover or grant any live account access.

Migration 0076 creates operational_instruction_access and adds operational provenance to guided lesson drafts. Its Netlify migration is mirrored. There is no backfill. Suspending this overlay never removes genuine pre-existing owner or instructor authority, and never creates the organization's sticky financial restriction on an ordinary account. An existing disabled or identity-drifted nonowner account can still have its dormant operational grant suspended; it cannot be reactivated until eligibility is repaired.

## Reader inventory and decisions

| Reader | Decision |
| --- | --- |
| resolveIdentity, financial principal/recognition, My Finance/self-pay | Unchanged; never consult the operational overlay |
| Account navigation | Separate canOperateInstruction display flag, without canInstruct or role changes |
| Instructor route | Separate operational-only workspace when the account lacks genuine legacy instructor authority |
| Assigned lesson schedule | Explicit schedule operation, current coach-ID binding, approved lesson kind, and assigned booking scope; no prices or order data |
| Guided lesson open/save | Explicit lesson-draft operation; current assignment, current grant, snapshot identity and draft revisions checked |
| Guided template context | New operational drafts receive name/age and template inputs only; no historical PD narratives, assessments, household records, or mixed financial desk |
| Purchased service snapshot | Runtime allowlist projection of identity/name/discipline/duration/version/sport; prices, commercial fields and unknown snapshot keys are excluded |
| Existing guided history | Operational-only access is limited to drafts opened through this path and last edited by the same account. Legacy or owner-edited history requires review and is withheld |
| Attendance observation | Explicit attendance operation; ended assigned lesson, current schedule timestamp and existing unpublished-draft review guard; separate operational_lesson_completions row only |
| Publish & Complete, assessment unlock, compensation | Existing authority remains required; operational-only save with complete=true is denied on the server |
| Shared-profile self editor, legacy coaching/availability, full PD desk | Existing authority unchanged; organization People controls retain their separate approved profile/availability workflow |
| Recruiting metrics/consent/verification | Existing authority unchanged; not mounted in the operational-only workspace |
| New paid offerings or service assignment | Existing owner commercial approval remains required |

## Identity and concurrency

Commands acquire the financial execution gate before account/domain locks. Revision checks reject stale changes. Consumers recheck verified/enabled account status, active basis, grant status, coach activity, and the original email-to-coach binding. Duplicate/reused coach IDs, conflicting operational-person bindings, or changed identities fail closed. Grants cannot bootstrap financial recognition or broad organization authority. Directory availability only controls new scheduling; it does not remove existing assigned lesson access.

Operational-only entry and draft access use a passive operation-specific viewer. They never invoke the legacy household-provisioning identity flow. Genuine owners and instructors retain their existing identity path.

Operational draft provenance is checked before opening or editing an existing draft. A genuine instructor or owner still follows the original authoritative path. The operational draft UI omits payment, booking-change, recruiting, full-PD, template-library and financial-completion controls; server checks do not rely on this UI separation.

## Deliberate limitations

- A new operational instructor with no owner-approved commercial service assignment has no new bookable offering and cannot set service availability before approval.
- Opening a guided draft retains the existing rule that a separate attendance observation waits for owner review of unpublished guided evidence.
- Operational-only users cannot publish family recaps, unlock assessment-gated purchases, recognize instructor earnings, or gain recruiting authority through this assignment.
- An existing or owner-edited private guided history is withheld. This patch adds no automatic classification or history-sharing approval.

## Verification contract

Synthetic PGlite tests cover legacy/captured gating; protected, self, disabled and unverified targets; stale revisions; grant/suspension; actor revocation; directory-unavailability preservation and email changes; reused/duplicate coach IDs; schedule scope; draft provenance; runtime snapshot redaction; idempotent scoped attendance; genuine owner/instructor preservation; and absence of household provisioning. Protected table snapshots and exact self-pay comparisons verify no financial, authentication, household, commercial, assessment, or base-role changes from onboarding and its operational actions. Render tests cover operational form and instructor workflow interactions. No live grant or release is part of this implementation.

The recovery reconstruction preserves the final passive-identity and existing-assignment safeguards. Results must be re-established on the reconstructed tree; prior snapshot test results do not certify this checkout.
