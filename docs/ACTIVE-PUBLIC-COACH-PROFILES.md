# Active public coach profiles

A saved published profile no longer keeps a deactivated or removed coach in the public directory. Public profile lookup is limited to active coach IDs from the current working file, in addition to the existing publication and public-field validation. Drafts remain private. This does not delete profiles or automatically republish anything.

Migrated database tests execute the actual publicCoaches service for active, inactive, orphaned and draft profiles, and preserve the public DTO’s private-field exclusion. Existing direct query coverage verifies empty allowlists and malformed profiles. No migration or staff-role changes; hosted role/browser acceptance remains separate.
