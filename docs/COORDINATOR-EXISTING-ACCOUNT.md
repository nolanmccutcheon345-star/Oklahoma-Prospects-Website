# Existing registered account assignment

Coordinator Invitations previously offered only an email invitation. Owners with dedicated staff-role authority can now select an existing active, verified adult account and assign baseball or softball coordinator directly.

Acceptance criteria:
- The authorized staff workspace supplies account names and emails; there is no public account directory or person-specific identity.
- Initial assignment is server-enforced: empty permissions, empty team IDs, team-limited coverage. The request cannot include permissions or scope overrides.
- Existing assignments (including suspended/removed roles) cannot be overwritten through the shortcut. Current verified account, owner authority, legacy-reader restriction and independent-role review checks remain enforced.
- Separate parent/coach/instructor privileges remain unchanged and are clearly described. Other staff roles require explicit review.
- Success opens the selected account and sport in Roles & Permissions for separate, explicit grants. No live customer role is assigned as part of publishing this feature.
- Existing email invitation flow remains available.

Validation: targeted backend authorization/zero-scope/retired-role regressions and mounted account selection/confirmation/error/duplicate-submit tests. Full required CI and exact-source preview/production verification remain release gates; receipts belong in the PR.
