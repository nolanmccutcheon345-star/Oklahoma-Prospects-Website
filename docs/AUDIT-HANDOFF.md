# Oklahoma Prospects audit implementation and release handoff

Prepared September 15, 2026. Source baseline: `49712f38196f114358abc87ca9da0f048a1b4fd4`.
Working branch: `audit-fixes` in `nolanmccutcheon345-star/Oklahoma-Prospects-Website`.
**Status update, September 16:** Netlify published `c84553b` at 00:55:20 UTC and
applied all 12 managed-database migrations. PR #4 remains a draft and unmerged;
online card checkout is disabled in production and the hosted preview. See
[RELEASE-READINESS.md](RELEASE-READINESS.md) for the current evidence, acceptance
gates, and the GitHub/Netlify source mismatch. The original procedure below is
historical; do not repeat already-applied production migrations. Grok remains pending.

## Implemented in this branch

- Verified server identity, household/athlete scoping, restricted coach money access, protected financial and assessment fields, and optimistic conflict checks for shared desk saves.
- Removed embedded owner passwords and startup account creation. Email changes reset verification and revoke sessions; administrative password changes revoke sessions. Service/staff reads no longer run table creation or automatic seeds. Office mutations have bounded runtime validation.
- Approved price corrections, integer-cent calculations, Chicago scheduling, full assessment durations and transactional resource occupancy. Ordinary lessons and packages remain locked until the coach records a completed assessment. Paying for or booking an assessment does not unlock them.
- Stripe hosted Checkout, signed webhook processing, persisted orders, idempotent fulfillment, verified guest purchase claiming, credit grants/redemption, subscription and invoice views, and durable refund intents. An expired hold cannot be reclaimed by a late payment; it goes to office review. Cancellation cannot overwrite a completed session or its earnings.
- Real intake, athlete, waiver and coach-progress endpoints; coach profile/availability edits; office request queue. These additions still need authenticated hosted acceptance testing.
- Route-scoped workspaces, save errors instead of demo fallback, public SEO metadata, real 404 status, responsive image variants, accessibility fixes, and matching per-response CSP nonces on server and client hydration scripts.
- Build and database migration are separate operations. Hosted requests require persistent storage. Preview database selection never silently falls through to the production URL. Live Stripe is enabled only in production with its explicit switch.

## Verification completed locally

| Check | Result |
| --- | --- |
| `npm test` | 414 passed, 0 failed, 0 skipped |
| `npm run typecheck` | Passed |
| `npm run lint` | 0 errors; 51 warnings remain |
| Netlify-targeted build | Passed; generated server and Netlify function verified |
| Grok/Nitro build | Passed; generated the existing Vercel-format deployment output |
| `npm run verify:build` | Home/login 200, unknown route 404, matching script/CSP/hydration nonces, distinct nonces and private HTML caching |
| `npm audit` | 0 vulnerabilities after pinning transitive `sharp` to 0.35.4 |
| Native image conversion | Sharp 0.35.4 / libvips 8.18.6 successfully converted a club image to WebP |
| Embedded credential scan | Removed owner password literals absent from current tracked/exported source |

The added PostgreSQL tests cover payment amount/session tampering, duplicate events and fulfillment, rollback/retry, expired holds, conflicting multi-resource reservations, durable cancellation, completed-session protection, assessment locks and refund boundaries. Stripe calls in these tests are offline fixtures, not provider test transactions.

The sharp override addresses the upstream [libvips advisory](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) and [libheif advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c). Keep the override until the Netlify image dependency chain adopts a patched release.

Browser hydration, mobile layout, keyboard behavior, real email and Stripe test flows are **not certified**. This workspace's dev server failed while enumerating network interfaces, and its browser blocked the local address. The build smoke test does not substitute for browser acceptance. GitHub CI separately checks Node 22; local checks used Node 24.

## Original Netlify release procedure (superseded by current readiness record)

Existing site: `oklahoma-prospects`, ID `c49ad0ab-1b2c-412e-88d9-1f6ddf490a17`.
Production domain: `https://prospectsbaseball.club`.
The inspected published deploy was an API/upload deployment without a commit reference; automatic GitHub preview deployment was not demonstrated. Do not trigger a main-branch build and assume it deploys this branch.

1. Authenticate the Netlify CLI, link the existing site, and create a **draft** deployment from this branch.
2. Configure an isolated preview Postgres database and preview-only auth/email/Stripe test credentials through the host's secure settings. A broad environment-value listing was blocked by automatic approval review because it could expose secrets; no deployment secret values were obtained.
3. Review pending migrations `0007_authority.sql` through `0012_coaching.sql` against an isolated database copy. Apply with `CONTEXT=deploy-preview RUN_DB_MIGRATIONS=true npm run db:migrate`. Back up production and reconcile legacy records before any production migration. A build never runs these migrations.
4. Build with `NETLIFY=true CONTEXT=deploy-preview npm run build`; run `npm run verify:build`; deploy the generated Netlify adapter output to a draft URL. Record the exact source commit with the deployment.
5. Complete the hosted acceptance checks below. Merge/promotion is a separate release step after the unresolved gates are addressed.

| Configuration | Scope and purpose |
| --- | --- |
| `PREVIEW_DATABASE_URL` | Isolated hosted preview/branch database; mandatory in those contexts |
| `DATABASE_URL` or `NETLIFY_DATABASE_URL` | Persistent production database |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Separate secret and correct origin per environment |
| `VITE_AUTH_ENABLED=true` | Public build flag; also recorded in `.grok/app-env.json` |
| `VITE_PUBLIC_HOSTNAME` | Public host setting if required by the preview/auth integration |
| `APP_BASE_URL` | Canonical origin for the current environment |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Test values in preview; production values kept separate |
| `STRIPE_LIVE_ENABLED` | `false` for previews; explicit `true` only for an approved live launch |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` or `EMAIL_FROM` | Verified transactional-email sender and server credential |
| `RUN_DB_MIGRATIONS=true` | Explicit migration invocation only; do not add migration to the build command |

No secret belongs in a `VITE_` variable or in this repository. Hosted Checkout does not require a browser Stripe publishable key.

Webhook route: `/api/stripe/webhook`. Configure the relevant Checkout completed/expired/async success/failure, invoice paid/payment-failed, subscription updated/deleted, refund created/updated/failed and charge refunded events in the matching Stripe environment.

## Gates and unfinished work

- Rotate the previously embedded credentials and revoke affected sessions using the actual account system. Removing source literals does not invalidate old credentials or erase Git history. This branch did not rotate live accounts.
- Reconcile legacy athletes, assessments, paid bookings, credits and memberships into the new ledger. Old client-set assessment flags and paid labels are not accepted as verified evidence. Confirm opening balances and avoid double fulfillment or duplicate charges.
- Prove preview isolation, correct cookie/origin handling, owner access and email verification/recovery with real test accounts. Confirm the database runtime role and least-privilege grants; enabling RLS alone does not prove isolation for a table-owner connection.
- Verify Stripe test success, decline, authentication, abandon, retries, renewals, refunds and guest claiming against an isolated hosted database. No live charges or refunds are part of acceptance.
- Small-group enrollment is blocked until a published capacity-controlled schedule and four-versus-five-session policy exist. Remote enrollment requires a recorded assessment; remote assessment delivery/fees still need an approved workflow. The UI explains the front-desk path.
- Confirm whether assessment completion applies across disciplines. The current recorded-assessment gate is athlete-wide. Membership/package refunds and injury/absence pauses remain review requests; automatic used-credit proration and pause billing semantics are not invented.
- Verified household invitation delivery/acceptance, GameChanger integration, automated contractor transfers, approved non-pitching benchmarks/curriculum and the Google review destination remain unfinished.
- Complete mobile, keyboard, screen-reader, contrast, SEO, redirect, CSP/Grok embedding and performance checks on the hosted draft. The 51 lint warnings also remain for cleanup.

## Grok continuation

Import or synchronize the **entire `audit-fixes` branch**, including the lockfile, migrations, server handlers, tests, environment flag and Netlify configuration. Copying page JSX alone cannot reproduce the transaction or security fixes. The changed-file manifest is [AUDIT-FILES.md](AUDIT-FILES.md).

Preserve the existing Grok chrome, `PreviewHostBridge`, PWA helpers, and the `scripts/with-app-env.mjs` wrappers. The local `.grok/skills` and references were not included in the exported repository; template tests now check the actual exported contracts without recreating those vendor instructions.

The non-Netlify build retains the existing Nitro/Grok deployment path. Configure Grok's own preview database, origins, test payment webhook and optional Grok authentication/connector credentials separately. Do not share production credentials or claim local demo state is persistent.

The inspected Grok browser session was signed out. This handoff is ready for import; no Grok project was modified or published in this continuation.
