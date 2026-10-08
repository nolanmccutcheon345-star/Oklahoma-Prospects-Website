# Legacy training authoring permissions

Owner requirement W9: player accounts follow assigned training, without administrative authoring.

The legacy create-program and add-drill handlers now resolve server identity and reject players. Parent, coach and admin account-local authoring stays available. Creating a drill checks program ownership in the same SQL statement as insertion; another account’s program ID and a missing ID receive the same generic rejection.

The player drills desk hides the create-program form. Reading assigned training and marking a personally owned drill complete remain available. This does not change the separate coach-assigned development workspace or household billing.

Validation: migrated disposable database coverage for player rejection, valid parent/coach authoring, cross-account and missing-program rejection, and malformed input. No production migration or hosted role-session test.
