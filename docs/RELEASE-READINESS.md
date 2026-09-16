# Audit release readiness — September 16, 2026

## Current decision

**The audit application is deployed. It is not yet accepted for online transactions.**
Keep PR #4 in draft until the blocking evidence below is recorded. Do not treat
mergeability, a successful build, applied migrations, or a working landing page
as proof of account access, payment fulfillment, or migrated customer balances.

Ordinary lessons and session packages must stay locked until a coach records a
completed assessment. Purchasing or booking an assessment never unlocks them.

## Verified release identity

| Item | Evidence |
| --- | --- |
| Source repository | `nolanmccutcheon345-star/Oklahoma-Prospects-Website` |
| PR | [#4](https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/pull/4), draft, mergeable, unmerged at review |
| Published source | `c84553bb847bd68714ec10cba73c400d0a812365` as recorded in the deploy title and PR; Netlify's machine `commit_ref` is null |
| Base branch | `main`, `49712f38196f114358abc87ca9da0f048a1b4fd4` at review; behind the live application |
| Production | [prospectsbaseball.club](https://prospectsbaseball.club), site `c49ad0ab-1b2c-412e-88d9-1f6ddf490a17` |
| Published deployment | [`6aa9e8d158b7dec89ee447d7`](https://app.netlify.com/projects/oklahoma-prospects/deploys/6aa9e8d158b7dec89ee447d7), ready, production context, published `2026-09-16T00:55:20.779Z` |
| Hosted preview | [`audit-release-check`](https://audit-release-check--oklahoma-prospects.netlify.app), deployment `6aa9e6aa7521fc9c964cdcab`, branch-deploy context, database branch `audit-release-check` |
| Database | Netlify records migrations 0001–0012 applied to production; CLI status independently reports no pending, missing, or out-of-order migrations |
| Recovery snapshot | Netlify records an on-publish production database snapshot at `2026-09-16T00:55:19.877Z`; restore has not been tested |
| CI for published source | [Verify club application run 35040950638](https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/actions/runs/35040950638), all job steps successful |

Netlify's build configuration currently points to a **different Netlify Git
repository** (`stevemccutcheon89/oklahoma-prospects`, provider `netlify-git`, branch
`main`), not this GitHub repository. Builds are not stopped. Therefore merging this
PR does not by itself configure GitHub continuous deployment, and a build from that
other source could replace the manual audit release. Resolve the source mapping
before relying on automatic builds. Do not trigger a build of the old `main` as a
substitute for deploying the verified candidate.

## Completed checks and their limits

- GitHub's successful run checks clean install, TypeScript, unit/in-process
  PostgreSQL tests, lint, dependency audit, Netlify-targeted build, and built-server
  HTTP/CSP smoke. Published-source test count: 418. Stripe calls in the tests are
  fixtures; these are not real Stripe test-mode transactions.
- Fresh production HTTP checks returned 200 for home, booking, training,
  memberships, the account shell and anonymous session; the session body was null.
  The account shell's HTTP 200 is **not** proof that owner login works. Bare `/login`
  redirects to `/login?next=%2Faccount`. Unknown route returns 404. `/visit`,
  `/check-in`, and `/checkin` return 301 to `/visits`.
- Live browser checks rendered home, memberships, booking and training. Selecting
  a cage loaded available start times. A 30-minute team cage selection displayed
  $30. Eleven ordinary-lesson/package buttons were disabled for the signed-out
  visitor. No application errors appeared in the inspected console logs (the
  browser extension logged unrelated metadata errors).
- Production and preview both displayed **online card checkout not active** and
  a desk phone link; neither offered a payment submit button. The page does not
  save a reservation in this disabled state. Customers must call the desk.
- Desktop training was visually inspected without horizontal overflow. Mobile,
  screen-reader, keyboard, contrast and performance acceptance are still open.
- The new `verify:hosted` command passed against both production and the hosted
  preview on September 16, including fresh CSP/script nonces and private caching.
  Lint passed with the existing 51 warnings and no errors. No production code or
  configuration is changed by these documentation and verification additions.

## Blocking acceptance work

| Gate | What remains | Evidence needed to close |
| --- | --- | --- |
| Payment provider setup | Checkout is disabled on both hosts. This branch implements Stripe, not Square payment links. Configure the selected provider's sandbox integration and matching webhook; keep test and live credentials separate. Do not enable live mode just to clear a check. | Hosted test checkout works with provider test credentials; correct environment/origin; no secret values in evidence. If Square is required, implement and test a Square adapter rather than treating the existing links as this integration. |
| Hosted payment lifecycle | Success, decline, authentication, abandoned/expired holds, duplicate/retried/out-of-order webhooks, renewals, failures, cancellations and refunds have not passed provider-backed acceptance. | Provider test event/session IDs and redacted ledger assertions proving exactly-once fulfillment, no double booking, correct balances and refund outcomes. No live charge/refund is needed. |
| Accounts and email | No signed-in owner/coach/parent acceptance session is available in this review. Google sign-in routed to a Google account chooser for xAI; automatic review blocked selection because the xAI authentication was not authorized. This is an uncompleted test, not proof that login is broken. Verification and recovery email delivery remain unproved for this app. | Approve the actual xAI/Google authentication path or use a user-selected email/password flow. Then verify owner access, parent A/B isolation, coach scope/earnings, delivered verification/recovery, and saved profile persistence. |
| Credential remediation | Source passwords were removed, but rotation and session revocation are not evidenced. | Record credential rotation and session invalidation in the actual account system, without writing credentials to the PR. |
| Customer data continuity | New schema deployment does not prove that legacy athletes, assessments, paid reservations, credits or memberships were transferred. | Compare source/destination counts and monetary/credit totals; reconcile opening balances; confirm existing bookings block slots; exception list resolved; no invented paid or assessed flags. |
| Assessment and portal workflows | Public locks and offline tests are present; authorized hosted transitions remain unproved. | A test athlete remains locked before and after assessment purchase, then unlocks only after coach-recorded completion; exercise save, credit redemption, cancellations, earnings, intake and waiver flows. |
| Preview isolation and runtime role | Deploy metadata confirms a separate database branch. Credential/origin scoping and runtime least-privilege grants still need verification. | Controlled test records stay in preview, production unaffected, correct cookie/origin behavior, scoped database permissions. Do not export production customer data to public test fixtures. |
| Release source and recovery | Live came from CLI; GitHub `main` and Netlify's configured source are not reconciled. | Link Netlify to this GitHub repository using its supported authorization flow, or document a deliberate commit-pinned manual release process. Record candidate SHA, deployment ID and DB branch; establish a compatible recovery deployment/snapshot. |
| Hosted UI acceptance | Mobile, keyboard, screen-reader, contrast, metadata/redirect completeness, CSP/Grok embedding and performance need completion. | Recorded desktop/mobile flow checks; no app/hydration errors; LCP <2.5 s and CLS <0.1 in the agreed measurement setup. |

Automatic approval review rejected production/preview environment-variable listing
because the command retrieves secret values even if its displayed output is only
presence booleans. No credential values are included in this record. Configuration
presence is **unknown**, not missing. Use a supported metadata-only capability or
the owner's secure configuration flow; do not retry through an indirect secret dump.

## Repeatable checks

```bash
npm ci
npm run typecheck
npm test
npm run lint
npm audit --audit-level=high
NETLIFY=true CONTEXT=deploy-preview npm run build
npm run verify:build
npm run verify:hosted -- https://audit-release-check--oklahoma-prospects.netlify.app
npm run verify:hosted -- https://prospectsbaseball.club
```

`verify:hosted` performs GET requests only: public page status, SSR content,
per-response CSP/script nonces, security/cache headers, legacy redirects and a null
anonymous session. It creates no account, message, booking or payment. Its success
does not satisfy the blocked acceptance rows above or prove which SHA is deployed.

Verification now covers pushes to `main` as well as `audit-fixes`. The manual
workflow can optionally run the hosted HTTP smoke once GitHub exposes that workflow
from the default branch. Hosted checks are opt-in and do not deploy anything.

## Finishing the release

1. Close the blocking rows using an isolated hosted preview and dedicated test
   accounts. Keep actual secret values out of GitHub, logs and chat.
2. Reconcile the release source mapping and obtain green CI on the final candidate.
   Update this record with the final SHA and acceptance evidence.
3. Mark PR #4 ready, complete review, and merge the reviewed candidate. Verify the
   resulting `main` commit and deployment mapping; do not assume merge publishes.
4. Publish only the accepted source and configuration through the established
   Netlify path. Current migrations are already applied; future migrations require
   preview verification and a compatible database recovery plan.
5. Repeat public smoke and authorized owner/customer flow checks. Record final
   deployment ID and time. Keep a compatible known-good deploy; restoring old
   application files alone does not undo database migrations or reconcile data.

## Separate unfinished scope

Small-group enrollment remains blocked until capacity and four/five-week policy
are approved; remote enrollment still requires assessment completion. Do not open
these products incidentally. Athlete-wide versus discipline-specific assessment,
pause/proration policies, household invitation acceptance, GameChanger, contractor
transfers, non-pitching curriculum/benchmarks and the Google review destination need
their own resolution. Grok synchronization and the unpublished team communication/
sponsorship work are separate from this release; this review does not publish them.
