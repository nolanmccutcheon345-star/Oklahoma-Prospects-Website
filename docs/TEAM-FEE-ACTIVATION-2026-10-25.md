# Team fee publication and invitations

Owner direction: admins must be able to publish team fees; admins, assigned coaches and permitted coordinators must be able to send invitations. The owner explicitly confirmed insurance on October 25, 2026. Insurance is not an additional fee-publication gate. No old emails were used.

## Demonstrated defects

- The live 13U Maroon draft correctly showed $3,300, but its publication button was disabled. Required policy/deadline/cost reviews were mixed with organization overhead review and the independent automatic-collection release switch.
- The client used an editable what-if roster for publication readiness while the server used the priced baseline. A hypothetical roster could disable a valid offer.
- Publishing required a separate save and opaque disabled state, and the initial readiness list did not include all server checks.
- Generic account invitations were limited to owners or an existing household guardian. Team coaches and scoped coordinators had no dedicated household invitation workflow.

## Changed behavior

Front Office → Teams & Players → select a team → **Review & publish fees** opens an accessible review panel. **Save & publish approved fees** validates and commits the displayed draft and published version in one transaction, with optimistic revision checks. Invalid drafts leave the existing saved/published version unchanged. The baseline price must cover costs; required dates, explicit event/uniform costs, review confirmations, zero-processing explanations and consistent written terms remain enforced. The existing policy template can be applied explicitly to a draft, including the owner-directed contingency refund provision. Accepted agreements remain unchanged.

The organization overhead review remains necessary for financial close and reliable profit reporting. It is not a prerequisite to publishing a priced team offer. Original spending budgets remain fixed at first publication, including subsequent fee revisions.

Automatic payment activation is separate from fee publication. An offer can be accepted and paid through individual Square checkout while automatic collections are paused. Published automatic-payment terms now expressly state that separate authorization and an active collection service are required, and families must make individual payments until activation is confirmed. Existing production verification switches, two distinct cards, consent, backup retry rules and the conditional 20% late-fee rules remain enforced. This release does not set verification switches or claim real provider transactions.

For an event-based schedule without a scheduled event, use **Set explicit payment dates (keep these percentages)**, then enter the second and final dates. This retains the configured percentages, including 70/15/15, and creates an explicit team schedule override. No tournament, deadline, zero cost or external professional approval is fabricated.

**Team invitations** is available for admins and assigned team coaches in the fee workspace. Coordinators see it for their selected team when explicitly granted both `enrollment.manage` and `contacts.read`. Every request rechecks current account status, team scope and roster guardian email. No new coordinator permissions are automatically granted. Invitations are limited to listed guardians of active roster athletes with an existing household link. They never grant staff roles, create an athlete, accept an agreement, sign a waiver or record a payment.

**Create & send invitation** persists the invitation and then requests its email. Pending invitations are reused with provider idempotency; expired/revoked invitations can be replaced. Delivery and acceptance recheck issuer authority and the guardian's current roster relationship. Staff can see invitation, provider and delivery statuses separately from verified household access. Failed or paused delivery stays visible and can be checked/retried. Email delivery is not assumed from an “Invited” roster label.

Account invitations may be sent before fee publication, with a clear explanation that no unpublished fee can be accepted or paid. Household access remains tied to the exact verified recipient email. Financial details, balances, budgets, medical records and exports are not added to the coordinator invitation response.

## Verification and release evidence

Targeted checks cover owner publication, failed atomic saves, stale requests, frozen financial revisions, $3,300 and $2,310/$495/$495, retained accepted fees, immutable original spending budgets, financial close protections, invitation scope, wrong recipients, removed permissions, withdrawn athletes, expiry, duplicate sends and correct-email acceptance. Component checks cover the active review button, keyboard focus, required-input feedback and the complete publication payload.

Required full CI, exact-source preview and production verification are recorded in the release PR. Synthetic checks do not certify actual Square Sandbox transactions or controlled inbox delivery. No real family invitation, signature, payment or fee publication is performed as a test. Real team drafts still require their actual missing dates and cost/policy review through the admin workflow.


## Current-production integration (October 27, 2026)

PR #240 was not superseded by #241–#246. Independent billing, deposit saving, coverage explanations, agreement downloads and the parent guide were released, but organization-managed publication still depended on overhead and collection readiness and no scoped team invitation UI was present. This branch integrates those changes without changing production customer records.

The review now shows the actual per-player totals, schedule and complete family terms using the same offer builder as publication. The server rejects changed reviewed obligations before saving anything. Missing coverage explanations appear with the other publication requirements. Invitations are available for both funding models; operational coordinators still require both team-scoped permissions. Pending fee-email eligibility retains the invitation team ID so revoked coach/coordinator authority suppresses delivery. Scoped invitations send general account access; applicable fee instructions can queue at publication or household acceptance, while the owner catch-up preview remains available.

Production inspected read-only before release: the owner interface remains available, and the current roster's fee offers are still unpublished. This is an operational owner step, not evidence of a software deployment failure. No roster data is copied into this document. The automatic collection and email enable controls remain unchanged. Owners must approve actual fee amounts, coverage, dates and selected recipients. Square provider acceptance evidence and activation are separate from publication; no sandbox certification or live payment activation is claimed.

Release validation and the final exact-source receipt are recorded in PR #240. Existing accepted agreements, private profit calculations, baseline spending budgets and payment-authority gates are retained. Verification uses isolated synthetic records and mocked email/payment providers only; no customer fee is published and no real invitation or charge is initiated by the tests.
