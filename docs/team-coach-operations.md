# Assigned team operations

Admin access is resolved from verified owner grants, including when viewing the Coach desk. Non-admin coaches receive only assigned teams and may submit the tournament/league budget and choose from office-approved uniform packages. They cannot save the full fee model, edit organization costs, set deposits/installments/deadlines, publish fees, record payments, apply late fees, or financially close seasons. Player balances and installment/delinquency status are read-only. Submitted budget choices calculate draft player fees; Front Office publishes the approved fee.

Coach → Team Schedule, Games & Chat creates and edits games, tournaments and practices with Central Time dates, start/end times and locations. Games are published on Games when saved; practices/chat and per-player game stats require verified team membership. Scores determine wins, losses and ties. Final-game batting counts update existing season totals by a revision-checked delta; corrections and cancellations reverse the prior contribution. Earlier historical record/stat totals remain intact. Games and public team pages read these same persisted records. Existing unlinked Front Office video games are retained; matching names never automatically merge unrelated games.

One group chat includes current coaches, parents and players. Authors come from the authenticated account, not browser input. No direct-message feature is introduced. Existing legacy chat is retained in storage but not copied into the new family-visible thread, since it may contain staff-only content.

Roster names, numbers, positions and handedness can be edited; billing fields remain protected. Removing players with signed fees/payment records still requires Front Office review. Schedule entries do not reserve or charge for facility space. Tournament schedule changes do not rewrite accepted payment schedules.

Migration 0048 adds team activities and authenticated group messages. UI and migrated-database tests cover cross-team writes, non-admin financial restrictions, family/player chat, forged authors, result corrections, private player stats, and shared Games/team projections.
