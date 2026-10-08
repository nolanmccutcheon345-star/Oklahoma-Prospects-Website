# Player profile athlete link — owner W9 follow-up

The current training scope matches `player_name` against athletes within the account’s linked household. Therefore that field is an authorization input, not an editable display label for a player.

Authenticated player profile saves now update only the account display name. Submitted role, athlete name, email, household and financial fields cannot change the link or privileges. A missing player profile fails closed rather than inserting a new self-selected athlete link. Parent/staff profile behavior and initial parent/player setup remain as before; this patch does not add guardian-linked provisioning or an admin relinking workflow.

Validation uses actual migrations and resolved identities. A synthetic household has two athletes: submitting the sibling’s name through a player save must still open the original athlete. Tests also cover role escalation attempts, missing profiles, unchanged money values and parent behavior. No schema, Square operations or customer messages change.
