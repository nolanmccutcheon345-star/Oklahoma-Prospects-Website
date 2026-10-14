# Tryouts & Evaluations center

## Integration

Production target: `https://prospectssports.club`, Netlify site `c49ad0ab-1b2c-412e-88d9-1f6ddf490a17`, existing GitHub main. Extends `club_requests`, `office_request_work`, Better Auth identity, staff approvals, team assignments, existing evaluation rows, Resend, group enrollments, and booking occupancy. No replacement portal, payment product, customer migration, or historical notification blast.

The existing `/registrations` route is the coach center; the Coach App links to it. Existing registration readers retain their read-only desk. Owners retain its reader controls and group-event editor under **Access & group events**, and can grant a verified non-player account operational tryout-coordinator access. Sarah's actual account must be selected there; no account/email is guessed or auto-promoted. Steve/Nolan owner grants remain unchanged.

Active approved staff coaches and owners can review both sports and all tryout evaluations. Only original evaluators can edit their evaluations, with current team assignment still required for team evaluations. Parents, players, inactive staff and forged admin profiles cannot access the center. Contact-message, billing, medical, payment and unrelated household payloads are excluded from the center projection. Coordinator access is explicit, owner-managed and revocable. New tables use RLS and revoke public access; application queries require authenticated server-side authorization.

## Coach workflow

1. Sign in and open **Coach App → Tryouts & Evaluations**.
2. Choose **All Registrations** or **My Teams / Assigned Players**, then search/filter and open a player.
3. Assign the primary coach and team, set a follow-up date/status, and save. Changes use revision checks and audit attribution.
4. Use an editable email template or record a call, note, or family reply. Emails use the stored guardian email, not a client-supplied recipient. Replies go to the sending coach's verified mailbox. The portal does not receive inbound email automatically; record the reply in shared history.
5. Propose or confirm a Central-time appointment. Confirmed individual appointments reserve the same coach/lane occupancy used by rentals and lessons, without orders or charges. Group confirmations use the existing enrollment/capacity system and share one event reservation. A group with reservations must have its appointments cancelled before its time/resources can change. Cancellation releases space when the final group appointment is cancelled.
6. Open the player's evaluations, choose **New evaluation**, and save or submit the existing assessment form. Player identity, positions, age and sport carry forward. Internal assessments are not emailed automatically.
7. Owners can use the existing team-placement form to accept the player and create the existing roster/guardian-invitation link. Coach follow-up status alone does not create dues or roster membership.

Existing registrations are retained separately. A new registration is not merged with an athlete merely because the name matches. Existing roster links remain authoritative. Same-ID retry with changed content is rejected; repeated event requests with new IDs remain separate records for staff review.

## Notifications and deployment

Migration `0060_tryout_center.sql` is additive except for widening the existing follow-up check constraint. It adds revision/team/date fields, explicit coordinator permission, preferences, contact history, appointment records, group reservation mapping and a durable outbox. The generated Netlify migration is deployed through the existing pipeline. The new-registration trigger fires only for future inserts and queues only verified active staff/owner/coordinator recipients. It does not email historical registrations.

Preferences filter future registration alerts by sport, age and preferred team. Direct assignment, recorded reply, appointment and due-follow-up alerts remain visible. Email opt-out preserves in-app notices. The existing minute scheduler processes a bounded group notice and center notice with recipient policy checks, leases, stable provider idempotency keys and immutable request bodies. Retries stop for review after eight attempts or 23 hours. Provider acceptance is labeled separately from inbox delivery. Superseded pending appointment notices are skipped; a provider request already in flight cannot be recalled.

Existing settings are reused: `TRYOUT_NOTIFICATIONS_ENABLED`, `TRYOUT_NOTIFICATIONS_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` / `EMAIL_FROM`; isolated tests use `TRYOUT_EMAIL_TEST_RECIPIENTS`. Missing configuration is shown in the UI and messages remain queued. No credentials are added to code. Automatic review rejected a broad hosting-variable lookup because it could disclose secrets; no alternative secret retrieval was attempted and no hosting variables were changed. This release does not prove live provider activation, inbox delivery, or Sarah's live account assignment.

## Verification

- `src/lib/tryout-center.test.ts`: migrated disposable database, both sports, permission/revocation boundaries, deduplicated future-only alerts, preferences, shared history, stale edits, real occupancy conflicts, group capacity/cancellation, no commerce orders, synthetic provider timeout/idempotency and review cutoff.
- Existing evaluation tests updated for explicitly requested club-wide read visibility; attribution and edit restrictions remain tested.
- `scripts/check-tryout-center.mjs`: local synthetic Better Auth coach/owner/parent sessions, linked evaluation, shared contact, appointments and 320/390/768/1280 reflow. Added to required CI.
- Standard repository gates: typecheck, build, SSR verification, full regressions, lint, dependency audit and existing guided-lesson/public walkthroughs.

Release receipt and any outstanding blockers are recorded in the pull request. Synthetic checks do not establish real iPhone/VoiceOver behavior, provider inbox delivery or concurrent multi-connection load guarantees.
