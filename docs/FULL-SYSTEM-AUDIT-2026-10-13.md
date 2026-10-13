# Prospects Sports Academy: full-system baseline and improvement backlog

Audit date: 13 October 2026. Baseline production commit: `5025c9a17f8028080dadc9562cd5f6304ca87305`, released by PR #204. Scope: the owner's uploaded website mastery directive, all 50 page-route definitions, all 16 API-route definitions, and major operational domains. This is an initial risk-based audit, not certification of every runtime state or legal/accessibility compliance.

## Executive assessment

Preserve the existing platform. It already connects teams, household identities, booking, payment records, lessons, development history, games, and staff operations. The preceding release passed 900 tests in 47 suites, production build/security smoke checks, and two built browser walkthroughs. Rebuilding would put valuable working rules and records at risk.

This pass verified anonymous HTTP responses for all 45 fixed page URLs (38 HTTP 200, six 307 redirects, one 301 redirect), and all six team-detail links discovered in their server-rendered navigation (all 200). All public marketing pages in that inventory have one H1 and canonical metadata; `/members` is an exception because it is a client-side account redirect. Authenticated skeletons without an H1 are not classified as broken pages. No live requests were submitted, no account/payment records changed, and no complete production payment was attempted.

Two concrete search defects are corrected in this change: the sitemap listed the retired domain, and the private coach crawl rule also matched public `/coaches`. The updated sitemap also includes baseball, instructors, camps/events, games, and merchandise. Private athlete/team URLs are deliberately excluded.

The strongest next opportunities are independently verified payment lifecycle acceptance, real iPhone/VoiceOver workflow coverage, independently cached coach photos, and customer-journey measurement. No new P0 defect was confirmed during this pass. That is not a penetration-test or financial-accuracy certification.

## Evidence and limits

- Machine-readable route inventory, HTTP status, canonical/robots/H1 checks, links, HTML byte counts, and team-link checks: `audit-evidence/2026-10-13-route-baseline.json`. Requests were anonymous and read-only. Timings include the audit network and are **not** Core Web Vitals.
- Baseline CI run: https://github.com/nolanmccutcheon345-star/Oklahoma-Prospects-Website/actions/runs/38456238906. All 900 tests passed; lint passed; dependency audit reported zero vulnerabilities at that time.
- Baseline public built walkthrough: widths 320, 390, 430, 768, 1280; menu focus/Escape/return; sport/age filters; mandatory tryout fields, Back preservation and exactly-once persistence; cage steps. This is reused evidence from the same production source, not a claim that every page was retested at every size.
- Baseline authenticated instructor walkthrough uses isolated synthetic data and actual built server functions. It includes multiple instructors/household athletes, baseball/softball and 30/60/75-minute lessons. Existing authorization/lifecycle regressions supply additional coverage; production representative accounts for every role were not exercised in this pass.
- Current production training was inspected after catalog hydration. Assessment and youth lesson checkout links are enabled. Preview checkout restrictions must not be reported as production restrictions. Link availability is not successful payment evidence.
- Current source: TanStack Start/Router, React 19, Better Auth, `pg`/PostgreSQL with Neon configuration support, Netlify adapter, Square. PGlite is used for isolated tests. No private production connection configuration was exported; provider and database operations were not changed.
- Review samples: `identity.server.ts`, `auth/middleware.ts`, `commerce/access.server.ts`, `commerce/coach-access.server.ts`, `commerce/square-config.ts`, `commerce/square-webhook.server.ts`, `teams/privacy.ts`, `teams/public-view.ts`, `games.server.ts`, fundraising identity/reconciliation, shared SEO, styles, and the route implementations. This is not line-by-line review of every server function.

## Page and workflow findings

| Area and routes | Verified evidence and current experience | Priority / next action |
|---|---|---|
| Home `/` | One H1, current brand, four intent paths, server-rendered navigation; live UI and navigation checked in prior release | Preserve. Measure cage/coaching/tryout path completion before further rearranging |
| Baseball `/baseball`, softball `/softball` | Separate landing routes and common brand; HTTP/metadata pass | P2: user-test sport handoff through registration; do not change required fields without operations review |
| Teams `/teams`, `/teams/$teamId` | Six discovered detail links return 200; current signed consent required for public roster identity in source; private stats separately authorized | P1 acceptance: verify representative consent withdrawal/re-signing with disposable fixtures and monitor field complaints; never auto-convert waiver consent |
| Individual team statistics `/teams/$teamId/players/$rosterPlayerId` | Source requires team membership; route noindex; no arbitrary real athlete IDs probed | Preserve; role-boundary regression evidence rather than anonymous status alone |
| Coaches `/coaches`, instructors `/instructors` | Shared directory/cards, alt attributes present in fetched images; HTML 479,508 / 368,421 bytes in this sample | P2: fix crawl collision now. Next: media storage migration and factual bio review |
| Tryouts `/tryouts` | Three-step flow tested on built app; required positions/notes/USSSA status retained; submitted record tested in isolated database | P1 acceptance: delivery receipt and staff follow-up latency in production; don't submit fake customer registrations |
| Training `/training` | Sport/age/discipline finder; live production checkout links; selected athlete before service cards; youth exception | P2: improve catalog loading state; users briefly see “No matching lessons” before data arrives |
| Assessments/lessons `/pay`, `/instructor`, `/player/$playerId` | Server assessment gate and coach identity checks; built authenticated lesson walkthrough passes | P1: provider-backed purchase → assigned booking → completed recap → guardian view acceptance |
| Rentals `/book`, `/facility` | Progressive spaces/time/review; authoritative quote/availability retained; HTTP and browser step checks pass | P1: independent paid booking/refund/failed payment acceptance, including collision and closing-time boundaries |
| Cage passes `/memberships`, training plans `/training?view=plans` | Separate cage versus instruction surfaces; server scope/eligibility gates | P1: provider renewal, cancellation, pause request and credit expiry acceptance; no changes to financial rules |
| Account `/account`, `/family`, `/parents`, `/members`, `/my-profile` | Identity-resolved household scopes; private metadata; legacy aliases exist | P2: `/members` should eventually use server redirect and explicit noindex, instead of a 200 client redirect |
| Athletes `/players`, `/player-profiles`, `/player/$playerId` | Public directory information distinct from protected records; role/household tests in baseline | P1 acceptance: explicit player and parent end-to-end sessions; no inference from admin visibility |
| Staff `/coach`, `/instructor`, `/evaluations`, `/registrations` | Private metadata; backend role/scoped identity in reviewed modules; instructor built workflow passes | P1: coach/evaluation full-session walkthrough with isolated fixtures and cross-team denial cases |
| Admin `/office`, `/office-preview` | Front office protected; preview clearly fictional/read-only and noindex | P1: live financial reconciliation remains separate from fixture correctness; P2 mobile tables review |
| Games `/games` | Source filters drafts/unpublished; media flag gates video; owner writes check role/revision | P1 acceptance: permissioned real stream/replay and device testing; don't publish fake scores |
| Camps/clinics `/events` | Shared hero, price/age/location facts, expandable schedule from preceding release | P2: catalog-published availability/empty state checks for seasonal changes |
| Shop `/merchandise` | Explicitly not accepting orders; planned collections, no actual commerce enabled | P2 business decision: fulfillment, tax, stock and returns must be defined before launch |
| Fundraising `/fundraising/`, `/fundraising/example`, `/fundraising/p/$id`, `/fundraising/my`, `/fundraising/office`, `/fundraising/thank-you` | Public landing redirects to teams; dedicated noindex pages; server user/admin requirements and scoped published players reviewed | P1 acceptance: donor receipt, amount verification, revocation, refunds and family/office separation; no live donation attempted |
| Contact/help `/contact`, `/more`, `/recruiting` | HTTP/metadata pass; consistent contact footer; inquiry validation/rate limiting visible in server code | P2: verify actual email delivery and inquiry response ownership without sending unapproved messages |
| Policies `/terms`, `/privacy`, `/waiver` | Terms explicitly pending attorney review; privacy describes current operations; annual waiver household query | P1 legal review remains human. P2 clarify youth assessment exception in terms without changing policy |
| Check-in `/visits`, `/visit` | Current private page; old route redirects; waiver enforcement has regression coverage | P1 acceptance: staffed check-in using approved disposable booking |
| Sign-in `/login`, `/two-factor`, `/invitations` | Private metadata; shared hydration race fixed previously; same-site auth middleware | P1 acceptance: iOS password manager, 2FA, invitation expiry and recovery; never weaken auth to reduce steps |
| Results `/paid`, `/fundraising/thank-you` | Private/noindex confirmation surfaces; payment lifecycle fixture evidence | P1: backend provider outcome, not arrival at a thank-you URL, determines success |
| Legacy links `/go/$dest` | Source allowlist routes destinations; unknown values fall back to booking | P3: server redirect consistency; preserve published links |

The complete route-by-route inventory is appended below. API routes are also inventoried. We did not GET/POST reconciliation, notification, webhook or checkout endpoints merely to “test every link”: these are operational interfaces, not ordinary navigation links.

## Ranked backlog and concrete acceptance criteria

| ID | Priority | Problem / evidence | Solution and expected benefit | Effort / risk | Acceptance |
|---|---|---|---|---|---|
| SEO-01 | P2, implemented | Live `/robots.txt` had `Disallow: /coach`, which prefix-matches `/coaches` | Bound private coach rules to exact path, slash descendants and query suffix. Restore public coach discovery | Small / low | `/coaches` and `/coaches?…` allowed; `/coach`, `/coach/…`, `/coach?…` blocked |
| SEO-02 | P2, implemented | Live sitemap had 13 retired-domain URLs and omitted five public destinations | Current canonical domain and 18 public entries; omit private routes | Small / low | Every sitemap URL current origin, live 200, self-canonical, not noindex and not crawler-blocked |
| PAY-01 | P1, evidence gap | Code and mocks do not prove provider → database → confirmation behavior | Approved provider sandbox lifecycle with evidence; production acceptance separate | Medium / financial risk if done live | Payment/booking IDs correlate; failed/duplicate/late webhooks cannot double-book; refund/renewal/email outcomes verified |
| A11Y-01 | P1, evidence gap | Chromium and keyboard tests don't prove iOS/VoiceOver or WCAG conformance | Device/assistive-technology matrix for booking, tryouts, instructor and family workflows | Medium / low code risk | 200% zoom, keyboard, spoken labels/errors, target spacing, no obscured focus, password-manager and 2FA completion |
| PERF-01 | P2, verified | Coaches HTML ~480 KB; 183,990 characters of inline image sources across two images. Instructors ~368 KB with one 76,423-character inline image | Migrate approved coach images to stable optimized URLs with width/height, responsive variants and independent caching. Preserve originals and consent | Medium / medium, data migration | Before/after transfer size and LCP measured on same device/network; images look correct; old records still render |
| UX-01 | P2, verified transient state | Training initially reports “No matching lessons” while catalog loads | Show “Loading available lessons…” while pending; distinguish empty versus failed catalog | Small / low | Slow-network test: loading, loaded-empty, loaded-data and error each accurate; selected filters preserved |
| CONTENT-01 | P2, verified | Terms say ordinary lessons need assessments without explicitly restating youth exception | Proposed exact sentence: “Regular private lessons and packages require a coach-completed assessment. Youth lessons for players age 11 and under do not require an assessment.” | Small / policy review | Matches server eligibility and customer lesson cards; attorney review status retained |
| SEO-03 | P2, verified | `/members` returns 200 with no H1/canonical/robots; source performs client Navigate | Server redirect to `/account`, keeping existing links valid | Small / low | Direct request redirects; signed-in/out destination remains appropriate |
| DATA-01 | P1, evidence gap | Production consent impact count and provider reconciliation outcomes not exported | Aggregate admin-only operational checks, with no minor identities in analytics | Medium / privacy risk | Counts reconcile against authority; private rows remain role-scoped; access logged |
| MEASURE-01 | P2, unverified | No conversion dataset or field performance dataset supplied | Define privacy-minimized events at successful server transitions; aggregate by flow, never names/DOB/health/video URLs | Medium / privacy review | No duplicate purchase event, no success on mere page arrival, no minor PII; retention/purpose documented |
| SHOP-01 | P2, explicit incomplete feature | Main Shop destination leads to planned collections | Define fulfillment and customer support operations, then enable only tested products | Large / commerce risk | Stock/tax/shipping/refund/tracking acceptance completed before checkout |
| CONTENT-02 | P2, business evidence | Previously supplied absolute scholarship claim needs supporting records | Owner provides timeframe/denominator/source, or approves factual experience-focused wording | Small / reputation risk | Claims attributable and documented; no invented outcomes |
| OPS-01 | P2 | CI covers broad tests, but stale scaffold AGENTS instructions still describe another host/app-builder | Replace stale project guidance with a reviewed description of current Netlify workflow and safeguards | Small / medium process risk | Owner/project instructions reconciled; payment/data preservation rules explicit |

## Component and content standards

Keep the existing navy/light-blue/white/maroon palette and shared `PageHero`, buttons, fields, cards, dialogs and status patterns. Keep staff and public shells distinct where their tasks differ. Use one primary action per section, visible Back on multistep forms, short hints below labels, and persistent save/completion status for lessons. Empty, loading, error and success states must be distinct. Show current catalog prices and actual scheduling availability, never historical seed prices as live offers.

For mobile: preserve the six-item main bar and concise Train/Teams dialogs; do not add nested drill-down menus. Use at least 44 CSS-pixel primary controls as a product target while auditing WCAG 2.2 AA target-size rules and exceptions separately. Sticky actions must not cover focused inputs or errors. Tables need contained overflow rather than widening the whole screen. Photos must be authentic and consented; illustrations must not imply actual participants.

Additional exact copy proposals (not silently published):
- Catalog pending: “Loading available lessons…”
- Catalog error: “We couldn’t load lessons. Try again, or contact the front desk.”
- Catalog empty after filtering: “No lessons match these choices. Change your filters or contact us for help.”
- Shop status: “Our online shop is coming soon. Contact the front desk about current merchandise.” Replace only after staff confirms how merchandise inquiries are handled.

## Quality scorecard

A single 0–100 overall rating is **unverified**, not guessed. For each category, score only after its rubric has complete evidence: percentage of predeclared checks passed, weighted as below. Unknown checks remain unknown; they are not counted as passes or silently assigned zero. Any confirmed P0 overrides the weighted total.

| Category | Weight | Baseline / present evidence | Needed for a defensible category score |
|---|---:|---|---|
| UX/usability | 15% | Unverified overall; tested public steps and instructor workflow | Observed first-time parent/player/coach tasks, completion and recovery |
| Visual/brand | 12% | Unverified overall; shared shell/cards; selected mobile/desktop visuals reviewed in #204 | Screenshot matrix of all page families and empty/error states |
| Function/workflows | 18% | Unverified overall; 900/900 baseline automated tests, 51/51 read-only URL responses successful/expected redirects | Provider-backed payments, email, representative role/device end-to-end acceptance |
| Content/clarity | 10% | Unverified overall; youth terms omission and transient loading wording documented | Published bio substantiation, catalog/policy copy sweep, operational owner signoff |
| Navigation/IA | 10% | Unverified overall; all discovered fixed internal links map to routes; six team links 200 | Role-specific navigation task study, dynamic links and seasonal content |
| Mobile | 10% | Unverified overall; five widths in public walkthrough | Real iPhone/Android keyboards, zoom, payment and dashboard matrix |
| Performance/technical | 8% | Unverified overall; build/SSR gates pass, measured HTML payloads | Repeatable device lab measurements, 28-day field LCP/INP/CLS, DB/query timings |
| Security/privacy/accessibility | 10% | Unverified overall; server scoping samples, consent tests, CSP/cache smoke | Broader adversarial authorization review, upload/retention review, accessibility audit |
| SEO/conversion | 7% | Unverified overall; two search defects corrected | Search Console indexing, local listing ownership, outcome-based conversion data |

Measured submetrics are not overall quality scores: static page HTTP coverage 45/45; discovered team-link HTTP coverage 6/6; baseline automated regression pass rate 900/900. Search repair verification is recorded in the release PR after production checks. No conversion uplift or Core Web Vitals score is asserted.

## Research and applicable benchmarking

- NN/g, Mobile Subnavigation: https://www.nngroup.com/articles/mobile-subnavigation/ — favor discoverable low-cost paths and avoid deep mobile drill-down. Applied here: preserve concise global submenus and landing links.
- Baymard, Checkout UX: https://baymard.com/research-articles/current-state-of-checkout-ux — use its checkout research to evaluate input effort and recovery; it does not prove this site's conversion uplift. Applied here: retain staged forms and required operational fields, verify errors and Back preservation.
- W3C, WCAG 2.2 additions: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ — explicitly include unobscured focus, target size, redundant entry and accessible authentication in the acceptance matrix.
- Google robots rules: https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec — prefix matching explains the `/coach` collision. Robots is crawl guidance, never access control or a substitute for noindex/authentication.
- IMG Academy softball camps: https://www.imgacademy.com/sport-camps/girls-softball-camp — public program cards expose age, dates and pricing paths. Adapt that information hierarchy, not its pricing or brand.
- D-BAT memberships: https://dbat.com/membership — side-by-side benefits and usage guidance help compare plans. Adapt clear included-use comparisons; don't import competitor benefits or promise savings unsupported by Prospects rates.

These are design references, not a measured competitive ranking or copied visual design.

## Execution and ongoing review

This change touches two public search files and adds this audit/evidence. It makes no dependency, schema, authentication, price, payment, role or customer-record changes. Required CI and Netlify preview gates precede merge; the release receipt belongs in the PR with the exact published commit and live file checks. Rollback is a revert of the search-file change followed by a normal deploy; no database rollback is required.

Sequence: finish search repair → provider/device/role acceptance → loading-state and media improvements → privacy-minimized measurement → optional merchandising expansion. Revisit this backlog on subsequent website work. No background monitoring or recurring automation is claimed to have been created by this audit.

## Complete route inventory

| Route | Source | HTTP evidence |
|---|---|---|
| `/` | `index.tsx` | 200 |
| `/account` | `account.tsx` | 200 |
| `/baseball` | `baseball.tsx` | 200 |
| `/book` | `book.tsx` | 200 |
| `/coach` | `coach.tsx` | 200 |
| `/coaches` | `coaches.tsx` | 200 |
| `/contact` | `contact.tsx` | 307 → /contact?subject= |
| `/evaluations` | `evaluations.tsx` | 200 |
| `/events` | `events.tsx` | 200 |
| `/facility` | `facility.tsx` | 200 |
| `/family` | `family.tsx` | 200 |
| `/fundraising/` | `fundraising.index.tsx` | 307 → /fundraising |
| `/fundraising/example` | `fundraising.example.tsx` | 200 |
| `/fundraising/my` | `fundraising.my.tsx` | 200 |
| `/fundraising/office` | `fundraising.office.tsx` | 200 |
| `/fundraising/p/$id` | `fundraising.p.$id.tsx` | Dynamic pattern; source only |
| `/fundraising/thank-you` | `fundraising.thank-you.tsx` | 200 |
| `/games` | `games.tsx` | 200 |
| `/go/$dest` | `go.$dest.tsx` | Dynamic pattern; source only |
| `/instructor` | `instructor.tsx` | 200 |
| `/instructors` | `instructors.tsx` | 200 |
| `/invitations` | `invitations.tsx` | 200 |
| `/login` | `login.tsx` | 307 → /login?next=%2Faccount |
| `/members` | `members.tsx` | 200 |
| `/memberships` | `memberships.tsx` | 200 |
| `/merchandise` | `merchandise.tsx` | 200 |
| `/more` | `more.tsx` | 200 |
| `/my-profile` | `my-profile.tsx` | 200 |
| `/office` | `office.tsx` | 307 → /office?section=dashboard |
| `/office-preview` | `office-preview.tsx` | 200 |
| `/paid` | `paid.tsx` | 307 → /paid?order_id= |
| `/parents` | `parents.tsx` | 307 → /more |
| `/pay` | `pay.tsx` | 200 |
| `/player-profiles` | `player-profiles.tsx` | 200 |
| `/player/$playerId` | `player.$playerId.tsx` | Dynamic pattern; source only |
| `/players` | `players.tsx` | 200 |
| `/privacy` | `privacy.tsx` | 200 |
| `/recruiting` | `recruiting.tsx` | 200 |
| `/registrations` | `registrations.tsx` | 200 |
| `/softball` | `softball.tsx` | 200 |
| `/teams` | `teams.tsx` | 200 |
| `/teams/$teamId` | `teams.$teamId.tsx` | Dynamic pattern; source only |
| `/teams/$teamId/players/$rosterPlayerId` | `teams.$teamId.players.$rosterPlayerId.tsx` | Dynamic pattern; source only |
| `/terms` | `terms.tsx` | 200 |
| `/training` | `training.tsx` | 200 |
| `/tryouts` | `tryouts.tsx` | 200 |
| `/two-factor` | `two-factor.tsx` | 200 |
| `/visit` | `visit.tsx` | 301 → /visits |
| `/visits` | `visits.tsx` | 200 |
| `/waiver` | `waiver.tsx` | 200 |

## API surface inventory (source only)

- `/api/auth/$` — `src/routes/api/auth/$.ts`
- `/api/fundraising/checkout` — `src/routes/api/fundraising/checkout.ts`
- `/api/fundraising/dashboard` — `src/routes/api/fundraising/dashboard.ts`
- `/api/fundraising/export` — `src/routes/api/fundraising/export.ts`
- `/api/fundraising/players/$id` — `src/routes/api/fundraising/players.$id.ts`
- `/api/fundraising/players` — `src/routes/api/fundraising/players.ts`
- `/api/fundraising/receipt` — `src/routes/api/fundraising/receipt.ts`
- `/api/fundraising/reconcile` — `src/routes/api/fundraising/reconcile.ts`
- `/api/fundraising/teams` — `src/routes/api/fundraising/teams.ts`
- `/api/health` — `src/routes/api/health.ts`
- `/api/site-alerts` — `src/routes/api/site-alerts.ts`
- `/api/square/reconcile` — `src/routes/api/square/reconcile.ts`
- `/api/square/webhook` — `src/routes/api/square/webhook.ts`
- `/api/stripe/webhook` — `src/routes/api/stripe/webhook.ts`
- `/api/tryout-notifications` — `src/routes/api/tryout-notifications.ts`
