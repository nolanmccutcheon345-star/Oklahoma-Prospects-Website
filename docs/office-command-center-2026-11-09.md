# Unified Office command center

Base: main c3fdf3b (Office cleanup safeguards release). Implemented in an isolated worktree; no unrelated cleanup or fundraising branch changes included.

## Scope

The owner Office landing page now provides a searchable directory grouped into academy operations, teams/player development, money/business, and website/communication. All 14 non-dashboard Office sections open the existing embedded modules. Recruiting profiles, handbooks and the enrollment pilot use their existing same-origin routes. The daily queues, schedule, operational health, quick actions, staff/family workspaces and existing deep links remain available. No separate prototype or external demo shortcut is introduced.

No authentication, database, financial records, booking/Square logic, fees, publication rules or access permissions change. The directory only appears inside the existing owner workspace. No fundraising checkout is added or enabled.

## Acceptance and evidence

- TypeScript, production Netlify-adapter build and built SSR checks passed before the final metadata extraction; rerun against final commit for release.
- Synthetic DOM interactions cover all module targets, same-origin links, case/whitespace-insensitive search, no-result state and repeated clearing.
- Existing front-office PGlite regression passed, including owner authorization and protected billing queues.
- Chromium walkthrough added to required CI. Local Chromium could not launch due to executor socket restrictions, including after escalation. This is not a visual/mobile browser pass. The walkthrough checks mobile/desktop viewport interactions but does not certify styling or full authenticated routing.
- Full required CI, deployment preview, live release identity and hosted checks remain required before release. No merge or production deployment performed by this change.

## Consolidation still required

This makes existing production capabilities accessible from one command center. It does not claim that standalone apps have been imported or subscriptions cancelled. For each standalone app, identify the owner, host, data, paid plan, and any unique functionality. Export and verify unique records before retiring it; browser-local records require explicit collection and verification. Keep required production hosting, database, authentication and payments available. Fundraising remains a separate unfinished workstream until validated. Obtain an exact, verified retirement list and confirm material financial/legal consequences before destructive steps.
