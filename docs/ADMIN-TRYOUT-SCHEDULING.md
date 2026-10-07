# W3: admin-managed tryout events

Continuation from PR38; this PR is stacked on its exact ce533a52 head and targets fix/all-age-tryout-intake until that prerequisite is merged. Migration 0032 is reserved separately from the consent PR's 0030/0031; no production migration has been executed.

Verified owner accounts manage events from /registrations. Registration readers, coaches, parents, player accounts and forged profile admins cannot create/edit events or read the management list. Each record has sport, season, age groups, date, start/end Central wall-clock time, location, capacity and draft/published/cancelled status. Owner identity is resolved server-side. Session middleware enforces same-site requests and audit actor context. Changes write audit events and use a revision lease to reject stale edits. Cancelling retains the record; no delete tool is added.

The public tryout page loads explicit upcoming published events, separated into baseball and softball schedules. Draft/cancelled/past events and updater identity are excluded. No fake events or legacy-date backfill are added. Missing table returns an empty public schedule; other database errors remain errors. Capacity is a configured limit, not a claim about available spots.

Saving/publishing an event does not yet enroll or notify applicants. Individual requests remain in the existing office queue. Next: eligibility by sport/age/season, capacity-safe duplicate-protected enrollment, notification delivery and agreed private appointments. The editor and public copy make this limit explicit.

Release gates: apply 0032 to a confirmed isolated database, verify authenticated admin/read-only/player workflows and browser interaction/hydration, then review production migration target and backup. Local migrated Postgres tests and CI do not prove hosted environment isolation. No Square changes, transactions, real messages or production data edits.
