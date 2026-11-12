# Office cleanup safeguards

## Scope

Owner-requested controls for removing active roster memberships, resolving duplicate intake, removing team chat messages, selecting active evaluators, and identifying/deactivating staff accounts. Implementation and verification use synthetic records only. The examples in the request are not instructions to mutate production records.

## Data-preservation contract

- Removal is an explicit, audited operation on one identified record. It must never cascade across a team, family, event, payment ledger or evaluation history.
- Active roster membership and financial history are separate. Removing a membership does not forgive obligations, rewrite accepted agreements, refund money or erase payments.
- Duplicate resolution must identify a survivor and reject ambiguous household, athlete or financial conflicts. Preserve historical transaction identities and explain unsupported merges rather than silently dropping information.
- Message removal must be consistently reflected in the Hub, Coach Desk and Communication Review while retaining a restricted audit trail. Operational visibility approval is not deletion.
- Evaluation records retain their original evaluator attribution. Filtering options do not alter the underlying records.
- Deactivation blocks access rather than deleting accounts. Role removal must not remove unrelated roles or historical records.

## Required acceptance evidence

1. A verified owner can preview and confirm a single synthetic membership removal, including exact player/team/contact, authoritative balance and mandatory reason. Coaches and parents cannot execute the action through UI or direct endpoint calls.
2. Reloaded active Hub/Coach/Family lists and counts exclude the removed membership. Sibling/team records and original financial/evaluation history remain unchanged. Stale or repeated requests cannot remove a different target or produce contradictory success.
3. Duplicate admission uses normalized same-team name/guardian identity, offers an existing record rather than creating another one, and remains safe under concurrent requests. Supported duplicate merges preserve linked history and explicitly reject conflicts.
4. Owner-confirmed removal of ordinary and withheld synthetic chat messages disappears from all active message readers. Wrong-account, stale-target and repeat requests are handled explicitly; underlying history remains intact.
5. Active evaluator options exclude inactive coaches by default. An optional inactive filter exposes historical choices without deleting or reattributing evaluations.
6. Saved coordinator assignments show their identified account even when inactive. Confirmations include the target, and unidentified targets cannot be removed. Account deactivation preserves records and records who acted and why.
7. Every successful removal is attributable in administrative audit history. Confirmation cancellation produces no mutation. Error and reload failures never claim a completed change without verification.
8. Run applicable focused tests, full regressions, typecheck, Netlify build, SSR, lint, audit, and synthetic browser checks before release. Production verification is read-only after separately authorized deployment.

## Implemented duplicate scope

Admission detects normalized same-team player name and guardian email and offers the existing membership. The merge operation supports duplicate memberships with no conflicting or linked history only. It blocks duplicates with payments, accepted financial obligations, aliases, enrollments, accounts, evaluations, fundraising or activity references. It does not consolidate paid duplicates or rewrite invitations and historical identities. Those cases require a separately reviewed consolidation workflow; rejection is intentional and must not be represented as a completed merge.

## Review and verification

Safety review added stale-preview invalidation, immutable owner-only removal metadata, protection against bulk-save resurrection, retained guardian-only billing, and transactional fundraising link checks. All tests use disposable synthetic records. The new message-removal migration adds immutable receipts without deleting source messages. Production acceptance examples have not been executed.
