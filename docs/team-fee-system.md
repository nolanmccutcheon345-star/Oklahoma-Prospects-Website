# Team fee plans

Front Office → Teams & Players / Reports contains the per-team fee workspace.
Assigned coaches use Coach Desk; linked guardians use their team family desk.

## Calculation and approval

All money is calculated in integer cents. Defaults are ten full paying players,
12.5% Team Contingency, a required $80 Team & Development Program Fee per player per Actual Billable Month, and a 50/50 owner split. Personal memberships are purchased separately through the site at the full published catalog price; no player membership add-on is offered.
These are editable per team; approved owner overrides take precedence over release defaults. Billing uses inclusive calendar months from actual team dates unless an approved billing-term override is recorded with a reason. Such overrides never change the actual service dates.
Uniform vendor cost, all baseline per-player costs, tournament costs, and all
coaching / operating budgets are inside direct costs before contingency.
Working drafts include the required Team & Development Program allocation in direct costs before contingency (`programCostModel: 1`). Organization fees remain outside contingency. Frozen published budgets without that version retain the historical formula.
PO pricing has its own direct allocation, incremental cost and organization fee.
Processing gross-up covers the configured number of rounded transactions; no method-specific fee
is added by this module.

Extra-player contribution includes the extra players' program and organization
revenue. Consequently it must NOT be added to program/organization revenue
for the entire roster. The program allocation is an internal team cost and academy revenue, not a second external expense. Reports reconcile from total revenue less external direct costs,
processing, service costs, and protected contingency. The three-part contribution report separates team operations from organization/program revenue; contingency remains protected from distributions. Roster downside does not
reduce published baseline fees. Company scenario overhead is counted once,
instead of adding both allocated team overhead and full company overhead.

Coach proposals remain drafts until an admin publishes. The last published
offer stays available while a replacement draft is reviewed. A guardian's
acceptance freezes the fee, installment amounts, policy and program service
allocation. Subsequent publications do not alter that agreement. Existing signed
agreements are preserved; amendments require separate Front Office review.
New fee agreements default to 70/15/15 using the published event-based dates. Admin can customize a deposit plus 1–12 subsequent payments, using percentages or exact dollar amounts for full and pitcher-only players. Totals must reconcile before publishing; percentage schedules put cent rounding into the final installment. Second/final installments already overdue at late acceptance become
due at acceptance. Customized plans use the earliest scheduled team tournament minus the admin-configured number of days (default 28), unless an explicit final-date override is set. Older published schedules and accepted agreements retain their original terms.

## Collections and actuals

This module does not initiate Square charges, send invoices, send owner payments,
or place vendor orders. It reads existing verified team payment records and
provides an admin action to record externally received payments. An amount
cannot exceed the agreed outstanding balance. Deposit readiness is based on
amounts received, never on a receipt's label. Uniform release is an admin
authorization record, requiring a confirmed roster, a satisfied deposit and a
valid cutoff. Uniform sizes continue through the existing family desk.

Overdue statuses are calculated from unpaid installments. Roster holds/removal
require an admin action after the configured threshold. Reinstatement requires
the balance to be settled. New automatic agreements allow a one-time 20% late fee per unpaid overdue installment only after both confirmed card declines, elapsed calendar-day grace and owner review. Future installments and prior late fees are excluded. Original accepted fees and schedules remain separately retained; assessments appear as additional ledger obligations. Historical fixed-dollar late-fee terms remain unchanged. Repeated assessments of the same installment are blocked.

Record actual costs, refunds, processing and service expenses in the expense
ledger. Do not duplicate overhead there if it is included in the overhead
allocation. Program revenue is earned proportionally over the agreed inclusive
service dates, independent of collection timing. Collected contingency is shown
as a pro-rata allocation, capped at the required reserve, not a bank balance.

Before season close, actual distributable profit is zero. Closeout requires the
season to end, all entered expenses to be paid and all agreed balances to be
settled. The admin must confirm that all obligations, refunds, overhead and
reserves have been recorded. The closeout figure deducts actual paid/unpaid
expenses, overhead, required business reserves and unearned program revenue from
collected cash. It is an allocation report, not authorization or execution of
an owner withdrawal. External liabilities cannot be inferred from a blank ledger.

## Storage and privacy

Migration 0046 stores financial plans separately from shared club records.
Every request uses verified server identity and team/guardian relationships.
Only owners receive budget, vendor cost, actual expense or profitability data.
Coaches receive permitted choices and player payment/readiness summaries.
Guardians receive only their own players and published terms. Concurrent writes
are serialized against the club row and revision checked. Accepted agreements
and roster changes atomically update the existing club record. Actions are audited.

## Verification

`fee-model.test.ts` covers all requested roster mixes, 8/9-player downside,
partial months, cost changes, contingency consumption, unexpected costs,
processing, exact installment rounding, dates and company overhead.
`fee.server.test.ts` covers permissions, proposals, approval, acceptance,
immutable agreements, partial deposits, uniform release, holds, reinstatement,
late fees, one-time application, unpaid expense closeout rejection and actual
distribution reconciliation. Existing recorded-payment and billing privacy
tests cover overpayments and player-versus-parent billing projections.

Current editable defaults, inheritance, payment dates and historical safeguards: [October 22 pricing defaults](team-pricing-defaults-2026-10-22.md). Legacy scheduling descriptions above apply only to retained historical/custom plans.


## Prelaunch readiness and delivery

The owner workspace lists readiness for every open team. Missing or ended seasons, undocumented billable-month overrides, unreviewed costs or processing, incomplete policies and unsupported automatic-charge or penalty promises block new publication. Historical accepted terms are preserved. Coaches and coordinators do not receive this financial checklist.

Account invitation creation saves an invitation only. Owners and authorized household inviters explicitly request email delivery. The durable outbox uses one immutable message and provider idempotency key per invitation; uncertain retries stop before the provider key expires. Preview recipients require the existing exact email allowlist. Revocation, expiration and issuer authority are checked before delivery and again at acceptance. Provider acceptance, reported delivery and account acceptance remain distinct statuses. No existing pending invitation is automatically queued by migration. `INVITATION_EMAIL_PAUSED=true` pauses delivery; the existing notification worker handles requested retries.

Enrollment clearance counts matched, reconciled production Square payments, owner-verified external receipts and approved credits. Sandbox payments never clear production enrollment. Refunds and active/lost disputes invalidate clearance. Dispute updates use increasing provider versions; a stale event cannot restore an older state. Resolving a dispute does not automatically clear the athlete again. Financial administration remains restricted to current owner grants, and staff see only their allowed operational status.

Software fixtures and browser walkthroughs do not prove provider transactions or inbox delivery. Before fee publication and bulk invitations, retain a readiness record per team, provider Sandbox evidence, controlled inbox evidence, and isolated baseball/softball guardian journeys. Missing business facts must be supplied and reviewed rather than inferred from other teams or old messages.


## Automatic collection release gate

`TEAM_AUTOPAY_ENABLED=true` enables the scheduler; production also requires `TEAM_AUTOPAY_SANDBOX_VERIFIED=true` and the production deployment context. Keep both flags unset until actual Square Sandbox cases and controlled email delivery are recorded. The full-catalog launch flag does not bypass this gate. Publication of new automatic-payment offers fails closed while production collection is paused. No migration authorizes a card, sends an invitation, or starts a customer charge.

Guardian consent and each primary/backup attempt are recorded separately. Existing checkout concurrency controls reserve the original agreement balance; manual receipts cannot be added while a production charge is pending or uncertain. Changing either saved card pauses collection until renewed guardian consent; an in-flight or failed installment involving old cards requires review and can be paid manually. Revocation remains available to the authorizing account. Owners can inspect redacted configuration status and pause individual authorizations, without retrieving card tokens. For new automatic agreements with an outstanding balance, enrollment clearance also requires active two-card authorization.

The scheduled function processes a bounded batch every minute. A stale in-flight attempt goes to review; it is never silently retried against the backup. Verified provider reconciliation can mark it paid. New consent does not erase a failed or uncertain attempt. Sandbox receipts use an isolated collection projection and never write received funds into the production roster ledger. Failed-primary, failed-backup and uncertain-result notices are queued separately from receipts and owner alerts.

The requested percentage is implemented as a pending owner policy, not a legal conclusion. Before activation, obtain qualified review of the actual seasonal agreement under applicable Oklahoma law, including 15 O.S. §§ 213–215 and whether the consumer-credit provisions apply. Do not fabricate review evidence or assess a prohibited penalty. Provider verification alone does not establish policy enforceability.
