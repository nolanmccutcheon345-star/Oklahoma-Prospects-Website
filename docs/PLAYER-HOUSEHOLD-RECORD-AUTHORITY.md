# Player household record authority — owner W9 follow-up

The player development desk must not act as an administrative profile editor. Player saves now preserve athlete records (including name, birth date, sport, assignments and eligibility) and household records (including contact details and privacy preferences). Existing player training logs remain supported; parent/staff scoped editing is unchanged.

Opening an unlinked player desk does not auto-create a household in the development working file. The existing identity resolver still maintains its separate login/household records; this patch does not replace guardian-linked provisioning or add admin account-linking tools.

Validation covers malicious scoped input, retained training logs and parent edits. No migration, payment behavior, stored entitlements or customer message changes. Full hosted role-session/browser acceptance remains separate.
