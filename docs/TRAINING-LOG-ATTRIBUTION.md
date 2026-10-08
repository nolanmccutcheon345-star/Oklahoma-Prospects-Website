# Training log attribution

Updating a previously logged drill now records the authenticated account that made the latest edit, rather than retaining the original writer while replacing their content. The underlying service validates the existing reps/weight/RPE/notes schema and rejects malformed saved plans cleanly. Athlete access and assigned-drill checks remain.

Disposable migrated database tests execute actual coach/parent saves and verify latest-writer attribution, invalid input, unrelated athlete, missing drill and invalid date rejection. This is current-row attribution, not a new historical audit log. No migration, payment or customer notice. Hosted role/browser acceptance remains separate.
