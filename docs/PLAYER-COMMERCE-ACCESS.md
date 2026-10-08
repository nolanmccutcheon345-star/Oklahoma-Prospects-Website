# Player commerce access restriction

Owner requirement W9: player accounts may use their training workspace, with no booking, payment or billing access.

A shared commerce identity resolver now rejects verified player roles before storefront/payment data queries and provider work. It is used by checkout context/quotes/order status, payment submission, credit booking, family billing/guest-order claiming/check-in/pause requests, subscription/refund management and booking participant operations. Existing household ownership checks still apply to permitted parent, coach and owner identities. Anonymous visitors retain the public catalog. Server webhook fulfillment does not use viewer permissions and is unchanged.

The direct billing reader also checks the role before executing billing queries, protecting internal callers. The role comes from the existing verified server identity resolver; request-supplied role values are not accepted. Disabling a user still denies access.

This is a focused server authorization change with no database migration, price/policy change or provider test transaction. The training workspace, linked-player provisioning, guardian controls and any training-payload financial-field minimization are separate W9 acceptance work; do not claim the complete player account feature is delivered by this PR.

Validation: the real migrated database creates verified player/parent/coach identities, including shared household membership; the player is denied despite membership, parent household access remains, coach access remains and disabled users are rejected. A billing-reader negative test proves rejection happens before any query. No actual Square calls, charges, refunds or messages are used.

This branch is independent of PR33 cancellation behavior. When integrating that pending PR, retain the guarded identity imports and billing role check; do not replace them with the unguarded identity resolver during conflict resolution.
