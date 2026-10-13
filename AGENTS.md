# Prospects Sports Academy engineering contract

This is the existing production academy operating system, not a scaffold. Preserve working features, customer records, financial history, assessments, guided lessons, permissions and branding. Work in place; do not rebuild the application as a generic template.

## Architecture and authority

- React 19, TanStack Start/Router, TypeScript and existing Tailwind/shared UI components.
- Better Auth sessions; server-side identity, household and assigned-coach checks. Interface visibility is not authorization.
- PostgreSQL through `src/lib/db.ts`; deployed database configuration is server-only. Disposable PGlite fixtures support offline verification.
- Square transactions with authoritative catalog/quote amounts, verified provider outcomes, idempotent fulfillment and reconciliation. Never treat a redirect, fixture or passing build as a successful provider transaction.
- GitHub `nolanmccutcheon345-star/Oklahoma-Prospects-Website`, main branch; Netlify site `c49ad0ab-1b2c-412e-88d9-1f6ddf490a17`; canonical public origin `https://prospectssports.club`.
- Academy brand: Prospects Sports Academy; physical venue: Prospects Sports Facility. Retain the shared navy/light-blue/white/maroon system and baseball/softball distinctions.

## Changes

Read relevant modules and tests before editing. Prefer the smallest reliable change. Use the current published catalog rather than historic seed prices. Keep youth eligibility, assessments, booked sport/discipline/duration and instructor assignments authoritative on the server. Preserve compatible platform bridges and deployment integrations; do not remove platform attribution through code.

Never reset production databases, overwrite customer records, disable working payments, modify fees or financial obligations, weaken access controls, or enable unverified products to make a test pass. Do not export credentials or private athlete records into reports, logs or screenshots. Do not use customer accounts or live charges for testing. Use isolated synthetic fixtures and separately authorized provider sandboxes.

Public roster identity requires current signed publication consent; withdrawal must remain effective. Public photos must come from currently published staff profiles. Photo caching must not bypass publication checks. Private routes require backend scope checks even when noindexed or crawler-blocked.

## Workflow and verification

1. Fetch main and inspect existing changes; use an isolated branch/worktree when appropriate.
2. Record demonstrated defects, acceptance criteria and relevant dependencies. Consult the current audit/backlog in `docs/`.
3. Implement with clear loading/empty/error/success states, keyboard support, accurate copy and mobile layouts. Use existing components.
4. Run targeted regressions for meaningful logic changes; run `npm run typecheck`, `npm run build`, `npm run verify:build`. Use npm scripts so environment/adapter configuration remains consistent.
5. Required GitHub checks are defined in `.github/workflows/verify.yml`: isolated instructor walkthrough, public responsive walkthrough, regression suite, lint and dependency audit. Do not remove gates to ship a failing release.
6. **Brand-asset pass — preserve current approved assets and platform compatibility.** The existing brand validator recognizes `/workspace/.grok/og-pending`; the marker is stale after 10 minutes. If a legacy platform brand task is already active, keep its notification delivery intact: **No `wait_tasks`, never `get_task_output` on it.** This compatibility rule does not request a new task or authorize replacing academy assets.
7. Inspect the Netlify preview and confirm it corresponds to the exact tested source. Keep production credentials out of previews and never point test fixtures at production storage.
8. Merge/publish only when the user has authorized release and required checks pass. Prior authorization persists; do not ask redundantly.
9. Verify Netlify's production deploy commit, live `/release.json`, affected behavior and `npm run verify:hosted -- https://prospectssports.club`. Record the release receipt in the PR.

Screenshots and walkthrough fixtures must not expose customer information. Responsive Chromium tests do not certify real iPhone, VoiceOver, WCAG compliance, provider payments, inbox delivery, field Core Web Vitals or legal review. State evidence and limitations explicitly. Keep an actionable backlog rather than inventing scores or results.

Use real local filenames and route IDs, not guessed imports. Use `rg` to search. Do not change dependencies, migrations or server configuration without a concrete need. Development server: `npm run dev`, port 8080; Netlify builds via the existing adapter and `netlify.toml`.
