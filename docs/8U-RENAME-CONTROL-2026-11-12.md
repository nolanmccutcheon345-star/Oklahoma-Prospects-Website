# Existing-team rename control

Requested outcome: rename the existing Prospect Navy 8U baseball team to Prospects 8U without creating another team, changing its roster, or editing/publishing its fee draft.

The live Office at commit 78c14bc has no team-name input. This change adds a name form to each existing team in Teams & coaches administration and uses the existing revision-checked, authenticated server save. It modifies only the selected team's name in the submitted record. Existing authorization, financial protection, and save-conflict checks remain in force.

The form trims names, rejects empty names, limits length to 150, prevents repeated pending submissions, preserves input on failure, and provides cancel and confirmed-save feedback.

Checks: typecheck passed; changed-file lint passed; normal build passed; Netlify adapter build and verify:build passed. Render tests cover save failure/retry, cancellation, and repeated pending submissions. Privacy regression proves admin rename retains record fields and non-admin saves cannot rename. Full repository regression suite passed: 1,522 tests, 47 suites, zero failures/skips (39 minutes).

Not yet performed: remote CI, hosted preview, production deployment, live rename. Generated migration output is excluded. This patch changes no fees, permissions, or server APIs. Release requires owner authorization and repository gates, followed by the actual rename and reload verification.
