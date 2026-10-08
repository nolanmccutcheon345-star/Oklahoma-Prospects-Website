# New coach IDs

New coach IDs use a digest of the full normalized email. The former stripped 18-character prefix could collide between different staff and affect assignment lookup. Booking fallback and first-login provisioning share the same helper. Existing roster IDs are retained; this does not rewrite historical assignments or repair already duplicated records.

Tests cover shared-prefix, punctuation and normalization cases. No migration or hosted role test was performed.
