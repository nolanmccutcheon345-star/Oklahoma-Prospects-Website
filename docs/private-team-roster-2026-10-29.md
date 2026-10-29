# Private staff roster on team pages

## Defect and scope

A signed-in owner opening `/teams/$teamId` saw only the public consent-filtered roster, even when the private Coach Desk contained more players. This made existing team membership appear missing.

The team page now requests a separate staff-only roster after session hydration. The public roster remains unchanged except for explicit labeling and an accurate empty-state explanation. No player records, publication consents, pricing, fees, invitations, or financial access are changed.

## Privacy contract

- The POST server function uses existing `authMiddleware` and `clubIdentity`; client-supplied roles/emails are not accepted.
- Owners with the existing verified admin grant may read the minimal roster. Coaches must match the team's current head/assistant assignment; a parent identity additionally requires the server-resolved team-coaching capability. Restricted coordinator access remains denied by middleware and projection.
- Only team ID/name and player ID/name/jersey/withdrawn status are returned. No guardian contacts, medical information, consent signatures, or financial data leave this endpoint.
- Withdrawn players are labeled in the private membership record; withdrawal still excludes them from public display. Current public consent remains required for public identity.
- Responses are `private, no-store`. There is no SSR private roster payload or persisted/shared client cache. Identity/team changes unmount the private state and stale asynchronous replies are ignored.

## Verification

Synthetic regression coverage includes owner/assigned coach access; anonymous, household-only, unassigned coach, player and coordinator denial; assignment removal; cross-team/malformed records; demo/closed teams; minimal projection; unchanged consent/withdrawal behavior; SSR anonymity; sign-out/account/team navigation; stale replies; error retry and empty state.

Run:

```
node --import tsx --test scripts/staff-team-roster-render.test.mjs src/lib/teams/staff-roster.test.ts src/lib/teams/public-view.test.ts
npm run typecheck
npm run lint
NETLIFY=true CONTEXT=dev SQUARE_LIVE_ENABLED=false SQUARE_ENVIRONMENT=sandbox npm run build
npm run verify:build
```

Before release, require all existing CI gates and an exact-commit preview/production receipt per AGENTS.md. Synthetic rendering and projection tests are not authenticated production account/browser verification. Use approved synthetic accounts for hosted permission checks; do not alter customer roster/consent records for QA.
