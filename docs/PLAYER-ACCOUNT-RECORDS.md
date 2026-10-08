# Player account records — owner W9 follow-up

The authenticated account-profile reader returns explicit workspace fields rather than `select *`. It uses the resolved server identity for email and role. Player responses carry no plan name, price or actual lesson/remote credit balance. Zero values retain compatibility with the shared Profile type; they are redaction placeholders, not offers or account balances.

The legacy schedule reader keeps only the signed-in player’s own appointment details and redacts price. Parent and coach reads retain their own amounts; only verified admins retain the existing all-reservations scope. Extra profile or reservation columns are excluded for every role.

No stored balances, purchased entitlements, schema, payment-provider behavior or customer messages change. This complements the commerce role guard and player development data projection. It does not complete guardian-linked provisioning, all player interface acceptance or Square refund acceptance.

Validation: disposable database with the actual migrations, resolved player/parent/coach identities, private extra columns, own-record filtering, admin scope, preserved schedule details and unchanged stored amounts. GitHub CI and deployment evidence belong in the PR.
