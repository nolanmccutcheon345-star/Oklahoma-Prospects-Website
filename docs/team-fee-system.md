# Team fee plans

Front Office → Teams & Players / Reports contains the per-team fee workspace.
Assigned coaches use Coach Desk; linked guardians use their team family desk.

## Calculation and approval

All money is calculated in integer cents. Defaults are ten full paying players,
15% contingency, $200 per player per billable month, and a 50/50 owner split.
These are editable per team. Partial billable months are explicit admin inputs.
Uniform vendor cost, all baseline per-player costs, tournament costs, and all
coaching / operating budgets are inside direct costs before contingency.
Membership and organization allocations are outside direct cost and contingency.
PO pricing has its own direct allocation, incremental cost and organization fee.
Processing gross-up covers three rounded transactions; no method-specific fee
is added by this module.

Extra-player contribution includes the extra players' membership and organization
revenue. Consequently it must NOT be added to membership/organization revenue
for the entire roster. Reports reconcile from total revenue less direct costs,
processing, service costs, and protected contingency. Roster downside does not
reduce published baseline fees. Company scenario overhead is counted once,
instead of adding both allocated team overhead and full company overhead.

Coach proposals remain drafts until an admin publishes. The last published
offer stays available while a replacement draft is reviewed. A guardian's
acceptance freezes the fee, installment amounts, policy and membership service
allocation. Subsequent publications do not alter that agreement. Existing signed
agreements are preserved; amendments require separate Front Office review.
New fee agreements use 40/30/30, with the final installment absorbing cent
rounding. Second/final installments already overdue at late acceptance become
due at acceptance. A designated scheduled competition supplies the final
deadline minus 28 days, unless explicitly overridden by admin.

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
the balance to be settled. One-time late fees require the family's accepted
policy, elapsed grace, and admin review; repeated application is blocked.

Record actual costs, refunds, processing and service expenses in the expense
ledger. Do not duplicate overhead there if it is included in the overhead
allocation. Membership is earned proportionally over the agreed inclusive
service dates, independent of collection timing. Collected contingency is shown
as a pro-rata allocation, capped at the required reserve, not a bank balance.

Before season close, actual distributable profit is zero. Closeout requires the
season to end, all entered expenses to be paid and all agreed balances to be
settled. The admin must confirm that all obligations, refunds, overhead and
reserves have been recorded. The closeout figure deducts actual paid/unpaid
expenses, overhead, required business reserves and unearned membership from
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
