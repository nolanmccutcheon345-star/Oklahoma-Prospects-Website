# SEC-F-001a/b/c: publication consent and public field limits

Owner source: Nolan's W13 and latest clarifications. Focused continuation from main e7f5515; no other bot branch is changed.

Public list, direct player GET, and new sponsorship checkout all use the same server publication gate: approved, active, and explicit unrevoked consent recorded by the page owner. Public players contain only id (public route/payment attribution identifier), name, team, goal, story, raised and sponsors. Jersey number, approval/status flags, contact fields, owner identifiers, timestamps and share counters are excluded.

Creating a page or confirming an edit stores consent and an event atomically with the player mutation. Owner withdrawal records an event and revokes consent; administrator approval/resume cannot restore it. Editing somebody else's page as administrator invalidates permission and requires owner confirmation. Linked player accounts cannot manage publication. My fundraising includes a withdrawal control; edit/confirmation can restore permission, with the existing approval requirement for parent edits.

Migration 0030 adds consent state and append-only application consent history. It does not backfill consent from legacy approval or checkbox assumptions. Previously approved pages without recorded consent become unavailable until their owner explicitly confirms. Missing schema fails closed. Apply and verify on an isolated database before promotion; production migration was not performed in this continuation. No Square configuration or financial transactions are changed or executed. Withdrawal blocks future checkout creation; existing financial records and previously created provider checkout links are not revoked by this change.

Verification: real PGlite migration/consent regression covers legacy records, owner mismatch, approval/active conditions, withdrawal, administrator resume, content invalidation, atomic rollback and public field allowlist. Type/lint/build and remaining fundraising regression checks recorded in PR. Browser interaction and hosted role/data acceptance remain separate release checks.

Still tracked under W13, not completed by this slice: remove homepage fundraising solicitations; replace the public aggregate directory with actual team/roster/player routing; change share destinations to those roster routes. Actual team-to-player records must be mapped rather than inferred from age labels. Existing purchased/customer benefits and donor ledgers are untouched.
