# Team Hub readiness repair

Based on the November 8 read-only audit, checked against main 9c32d77.

## Code changes

- Show current public academy camps in Updates, Schedule, and next-calendar selection, independent of team season labels. Reuse the public catalog's publication and operational schedule rules. Prices come from saved catalog data, not the audit's historical copy.
- Keep paid camp registration distinct from team attendance replies. Camp entries do not create rosters, reservations, payments, team RSVPs, or announcements.
- Show “Coach to be announced” when the head coach is blank.
- Link the existing family payments/documents and annual waiver destinations. Explain that a schedule reply is not arrival check-in.
- Preserve verified-parent, household and assigned-coach server permissions. Add synthetic parent browser checks for absent admin controls, camp visibility and parent links.

## Operational work still required

These are not fixed by interface changes and must not be filled with invented data:

1. Supply approved roster records and parent emails for each team; use the existing roster invitation/acceptance workflow. A tryout request alone is not team membership. Do not publish minors' identities without the existing consent requirements.
2. Confirm head-coach assignments, team seasons, and practice/game schedules. November academy camps now display independently of a team's season; no team season was changed.
3. Confirm whether the November 8 workout occurred, and confirm/cancel November 10 tryouts and November 15 evaluation night with the organizer. Do not create historical or tentative events as confirmed sessions.
4. Triage the requests/evaluations backlog with approved outcomes; do not automatically close requests or send messages.
5. Final owner acceptance should use the authorized invitation flow for a linked parent. Automated checks use synthetic accounts only; no customer account is impersonated.

No production data, customer communications, financial obligations, notifications, roles, publication permissions, or deployments are changed by this patch.
