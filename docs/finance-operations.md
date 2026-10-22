# Prospects financial operations

Front Office → Finance brings together existing accepted team fees, team budgets, lesson earnings, billing invoices, Square payments/refunds, and a reconciled business-bank ledger. All amounts are integer cents; team roster payment records retain their established dollar format.

## Activation

1. Review real recurring facility and payroll costs in Master Defaults. No unknown costs are invented.
2. In Business Banking, add the checking account's nickname, bank, last four digits, and verified opening balance/date. The opening balance is at the **start** of that date; enter all subsequent bank movements. Earlier transactions can reconcile historical payments but do not change this opening balance.
3. Optionally record the business debit card's brand/last four digits and choose the default card. Never enter full account/card numbers, passwords, CVVs, or PINs. This is a manual ledger, not a live bank connection or transfer service.
4. Sync Square collections and settlements in date ranges of up to 31 days. Backfill from the opening date, then sync through today regularly. These are read-only Square operations. Unknown off-site sales retain their Square IDs and are labeled Other Square sale.
5. Enter statement transactions and match each exact bank movement. A settlement links to Square payout entries and underlying payments; it is not another sale. “Square transfers pending” includes known SENT payouts, not a guaranteed complete live Square balance.
6. Refresh earnings/team payables; generate and review this month's facility/staffing payables. Assign vendor/payee profiles and due dates. Legacy “paid” compensation must be matched to a historical bank debit before owner distributions are enabled.
7. Confirm dated instructor compensation rules (fixed, hourly, or percentage). Existing configured compensation remains the fallback. Published team budgets provide head/assistant season salary with daily accrual. Gas/hotel budgets require an audited review of completed travel before becoming earned compensation.

## Customer collections

Existing booking and subscription checkout remains on Square. Guardians can now pay an accepted team fee installment or balance from their player payment card. The server validates ownership, signed fee, role, and remaining balance; one unresolved checkout per player/environment prevents overlapping payments. Square confirmations are idempotent. Gross payment/refund history stays in commerce tables; net receipts update the roster, deposit readiness, and Finance receivables. Sandbox charges never fund a real team ledger.

Existing invoices and accepted team schedules feed receivables. Abandoned checkouts are not debts. Other issued customer obligations can be recorded manually, with immutable credit/write-off adjustments. Recording an invoice here does not send a message or initiate a charge.

Cash paid and credits/write-offs are shown separately. Sandbox and draft/scheduled subscription invoices do not enter production receivables. Verified partial subscription receipts reduce the invoice balance without granting benefits early. Older partial invoices with missing payment details remain explicitly unverified until refreshed from Square; they are excluded from known-balance totals and block financial certification.

Square & Refunds includes collections by source: gross, recorded Square refunds, known processing fees and collections after fees. Missing processing fees are not treated as zero. These are provider collection totals, not profit; merchandise costs, taxes, external reimbursements, manual receipts and operating costs stay in their respective ledgers. Complete historical imports and bank reconciliation are still required.

Family Billing can save a Square-tokenized backup card with explicit consent. The customer must separately authorize making it primary. **Automatic backup retries are not enabled.** Existing Square renewal and invoice recovery workflows remain responsible for collection. Login remains available during payment problems.

## Outgoing money

Approval → payment made externally → record reference (“in progress”) → exact matching bank debit → reconciled paid.

Approving or clicking Record Payment never initiates a bank transfer. Bulk approvals require the reviewed total. Failed transactions remain in history and can be retried with a new payment reference. Payees see only their own compensation and masked method preference. Organization bank records, other people's compensation and owner cash calculations are admin-only.

## Refunds

Normal customer refunds use the existing Square refund controls and provider-confirmed status. External reimbursement requires a specific Square refund whose current provider status is FAILED/REJECTED, an explicit admin confirmation, and enough unreturned/unreserved original payment value. Its amount stays reserved against Square retries. Only bank reconciliation marks the external reimbursement complete. Never use a generic payable to bypass this workflow.

Instruction compensation uses original lesson-credit funding where available, rather than a membership's first payment. Attributed completed refunds adjust the affected lesson. Ambiguous partial refunds/funding require review before compensation approval or payment.

## Owner distributions

Nolan/Steve default to 50/50. Team contribution is a forecast, not a payable. Distribution approval requires reconciled cash, protected team obligations and contingency, deferred service obligations, all payables/refunds, taxes, restricted cash and the required reserve. It also requires a reviewed cumulative earned-profit ceiling. The smaller of protected available cash and undistributed reviewed profit limits approvals. Existing approvals reduce later availability.

Bank balances and liabilities must be reviewed through today; unmatched movements, unmatched production settlements, compensation overpayments and missing source reviews block distributions. Review cadence is a preference, not an automatic transfer schedule. No accounting profit is invented from forecast team fees or owner capital.

## History and verification

Finance records cannot be deleted. Changes retain actor, reason, before/after values in append-only audit history. Revision checks reject stale editors. Existing club/commerce audit continues to record team-fee and refund changes.

Automated coverage includes full database migration execution, role/household isolation, approval/payment/reconciliation, duplicate rejection, exact Square settlement totals, refund fallback reservations, owner split/cash protection, credits/write-offs, team checkout/refund idempotency and rendered Finance/team controls. Live bank integration and automatic outgoing payouts remain intentionally unconfigured; real bank balances, payee instructions, and reviewed profit must be entered by authorized admins.
