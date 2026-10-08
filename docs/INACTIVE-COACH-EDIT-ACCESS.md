# Inactive coach edit access

A verified coach role does not override an inactive development coach record. The own-coach profile and availability commands now reject inactive coaches before profile or schedule writes. Reactivation restores existing behavior. Verified owner/admin authority is preserved.

A disposable migrated database test executes the actual profile getter and both saves, checking inactive denial/no writes and active success. No migration, role change, schedule edit or payment operation. Hosted role-session acceptance remains separate. Second of five continuation PRs; based on the service-duration fix.
