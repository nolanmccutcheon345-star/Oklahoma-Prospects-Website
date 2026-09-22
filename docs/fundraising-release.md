# Player fundraising release

Entry point: `/fundraising`. Parents sign in through the existing club account, create a player page with guardian consent, and share it after owner approval. Only the page owner or club owner can edit it. Donor details remain private. The front office can approve, pause, export, and reconcile sponsorships.

Square hosted checkout pays the existing Prospects merchant account. The order reference is the contribution ID. Only a provider-verified completed payment is credited. Duplicate events are idempotent; confirmed refunds reduce the player's total. Fundraising shares the existing verified `/api/square/webhook` handler without changing booking fulfillment.

## Release switches

Production requires the existing Square configuration plus `FUNDRAISING_PAYMENTS_ENABLED=true`, `FUNDRAISING_LEDGER_ENABLED=true`, and `FUNDRAISING_SANDBOX_VERIFIED=true`. Keep all three production-scoped. Apply `0027_player_fundraising.sql` before enabling. This migration adds fundraising tables; it does not rewrite existing booking tables.

## Acceptance evidence — 2026-09-22

- All 506 automated tests passed; TypeScript and Netlify build passed.
- All 27 actual SQL migrations applied in isolated embedded Postgres.
- Actual handlers and identity resolver checked parent ownership, owner-only approval/office, pending-page privacy, idempotent checkout, and private receipt projection. The test replaced only the database connection and session boundary with isolated fixtures.
- Actual fundraiser checkout created a Square sandbox order. A $5 sandbox payment completed, the signed application webhook credited the player once, repeated delivery did not double count, and invalid signatures/merchants were rejected.
- A full $5 sandbox refund completed; the application refund webhook reduced raised amount and sponsor count to zero.
- Sandbox payment: `zfLEQWcmNsaLbnWhmITc5pkD5icZY`.
- Sandbox order: `LxEqonvGPRwSX4pWFjONa3soBDeZY`.

These tests did not move real money. Signed webhook requests were delivered by the acceptance runner using a temporary test signature key; this does not claim a real production donation has been processed. Reported raised amounts are confirmed sponsorship amounts less refunds, before Square processing fees.
