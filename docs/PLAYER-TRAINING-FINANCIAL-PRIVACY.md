# Player training financial privacy

Continuation of owner requirement W9 after PR43's server commerce restrictions.

The player-development response now removes household purchase/credit balances, package and membership catalogs, booking-management waitlists, booking payout/reschedule metadata and unexpected private fields attached to family or booking rows. Families list only the permitted athlete ID. Nonfinancial training tier remains so assigned program features are not hidden. Assigned programs, training records and appointment date/time/coach are retained.

The existing shared schedule type requires a numeric price. Player appointment and service projections use a zero placeholder, not the actual charge or a promise of free lessons; the stored record and parent billing response are untouched. Existing appointment status is retained for the training schedule's upcoming/completed filtering. This is a server payload restriction; financial actions continue to be rejected by PR43.

Tests cover unknown private payment/account fields, distinct purchase amounts, household credits, sibling IDs, retained schedule/throwing plans, parent access and unchanged source records. The existing access and scoped-file regression tests also run. No migration, hosted data mutation or provider call is introduced.

This does not complete linked-player provisioning, guardian controls or every player UI workflow. Those remain separate acceptance work, including ensuring no player screen treats placeholder amounts as purchasable offers.
