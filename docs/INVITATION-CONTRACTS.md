# Invitation service contracts

Invitation issuance validates email, role and optional household ID before identity access. Household-linked invitations require an existing household under a row lock before prior invites are revoked. Invalid requests create no pending invitations. Existing player/guardian acceptance tests and disposable missing-household cases cover the service.
