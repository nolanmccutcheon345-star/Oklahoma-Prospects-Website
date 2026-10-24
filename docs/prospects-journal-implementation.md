# The Prospects Journal — implementation and release plan

## Repository audit (2026-10-24 UTC)

Baseline: `main` at `5dcac408d462252f1c333c07ed6ea39956704169`, including the tested public-navigation and shared-card work in #227/#228. Production remains a separately published Netlify release; a merged branch is not evidence of publication. The legacy domain redirects to `https://prospectssports.club`, which remains the canonical origin.

The application uses React 19, TanStack Start/Router, shared Tailwind brand tokens (Inter/Barlow Condensed, navy/powder/maroon/white), Better Auth, parameterized PostgreSQL through `src/lib/db.ts`, Neon in hosted environments, and disposable PGlite fixtures. Netlify emits the SSR function. Square checkout and all existing price authorities remain unchanged.

Reuse:

- `AppShell`, the measured sticky-height offsets, public menu and private workspace layout rules.
- `FrontOfficeShell` / `OfficeWorkspace`, verified-account and owner-grant checks, transaction locks, append-only audit conventions, revision-conflict handling.
- Existing staff/person, team, event, service and player relationships. Never copy private athlete development records into public article responses.
- Existing bounded, validated raster-image storage and protected image-response conventions. Journal images will be decoded, metadata-stripped, resized and capped; no SVG/HTML uploads or remote server-side image fetches.
- `pageHead`, canonical domain, CSP nonces, existing static sitemap destinations and privacy/cache rules.
- Existing program announcements stay intact. They are sport/team plain-text notices with coordinator approval semantics, not a rich article CMS. Journal articles add a separate editorial document domain without migrating or overwriting those notices.

Gaps: no `/articles` newsroom or article-detail route, rich editorial document model, article revisions/redirects, editorial grants, article-specific minor consent, scheduler, category/search feeds, editorial calendar or connected article analytics. The sitemap is currently static. No verified Search Console or GA4 integration was found; unavailable analytics must remain explicitly unavailable.

## Implementation sequence and acceptance contract

1. **Editorial foundation:** additive migration, typed validated block documents, category/tag metadata, immutable revisions and publication snapshots, optimistic concurrency and audit events. Database defaults contain no public articles or automatic user grants.
2. **Authorization:** existing verified identities and owner authority; explicit default-deny editorial capabilities tied to existing accounts. Scoped coordinator accounts remain constrained by their active sport/team access. Owner-managed editorial grants do not grant any financial or other operational permission. Server handlers authorize every read and mutation in the same transaction.
3. **Publication:** draft → review → approved → scheduled/published → archived; any material edit invalidates approval. Public reads use only the approved publication snapshot. Schedule changes, restoration, slug changes and unpublication are explicit, revision-checked and audited. Prevent redirect loops/collisions. Secure previews are authenticated and noindexed.
4. **Privacy/media:** bounded safe raster processing; article/media rights metadata; article-specific guardian consent for linked minor identity/photos, independent of general roster consent. Revocation suppresses public article/media immediately. No cached image route may bypass current publication/consent.
5. **Front Office:** editor, category manager, editorial dashboard/calendar, revision restore, preview, sources, related existing entities, consent review, feature settings and editorial-user controls. Accessible block editor supports text marks, headings, lists, links, tables, images/captions, safe video links/embeds, quotes, callouts and drills. Autosave must show success/error/conflict and retain unsaved work.
6. **Public experience:** original branded `/articles`, article details, category/sport/search/pagination, author archives, related stories and contextual existing-route CTAs. Hide empty homepage article section. Never invent trending metrics. Preserve every current navigation destination and booking link.
7. **SEO:** server-rendered article body, unique metadata, safe Article/NewsArticle and Breadcrumb JSON-LD, canonical URLs, draft/preview noindex, dynamic sitemap additions preserving existing URLs, permanent slug redirects, correct 404/503 behavior. No indexable filter permutations or keyword-doorway pages.
8. **Editorial launch:** 20 assignment records, six priority draft manuscripts, verification/source notes and the four named series. All drafts remain unpublished. Current pitching/arm-care facts require authoritative source review; organization claims and quotes require owner confirmation. No fabricated interviews/results/metrics/testimonials.
9. **Measurement:** privacy-aware actual article views and CTA navigation where configured; distinguish measured data from unavailable GA4/Search Console/provider conversions. Do not imply an external connection was completed.
10. **Verification/release:** integration tests for grants/scope/revocation, snapshot approval, scheduling, conflicts/restoration/redirects, consent, image safety, XSS, public data minimization and sitemap/metadata. Real built-app synthetic lifecycle: draft → upload → category → preview → review → approve → publish → public/SEO check → withdraw. Responsive/keyboard checks and existing booking/membership/shop/coordinator gates. Typecheck, build, verify:build, lint, dependency audit, full required CI. Exact-source isolated Netlify preview before merge; production commit and hosted smoke only after an authorized successful publication.

## Release boundaries

- No changes to prices, fees, payments, accepted agreements, existing grants, customer records or unrelated configuration.
- No invented published content or automatically published launch articles.
- No guessed analytics credentials, fabricated metrics, private production export or live charge for testing.
- Do not claim completed implementation, external account setup, production publication, device accessibility certification or measured field performance without evidence.

## Progress

- [x] Read the supplied master directive in full.
- [x] Inspect the existing code and identify reusable systems before edits.
- [x] Create an isolated branch from current main and record this plan.
- [x] Complete the implementation and launch drafts.
- [ ] Pass acceptance and existing release gates on the final head.
- [ ] Commit/upload, verify exact preview, and complete the authorized production release when publishing access is available.

## Implemented operator flow

Owners open **Front Office → Articles & News**. Delegated editors use `/office/journal` with their existing verified accounts and explicit Journal capabilities. Access settings start empty; sport/team scope remains intersected with current coordinator assignments. Existing billing, booking, fees and staff grants are not rewritten.

The initial additive migration installs eight editable categories and twenty private assignments. Six contain original draft manuscripts; none has an author, reviewer approval, fact-check attestation, rights confirmation or publication snapshot. The import control is idempotent and never overwrites an existing draft. Owners assign real published staff bylines, complete source/organization verification, save, submit, approve the exact revision, and explicitly publish or schedule. Restoring a revision creates a new unapproved draft. A published snapshot stays unchanged while a revision is edited; Unpublish/Archive withdraw it.

For minor identity/images: select the existing athlete, save the exact version, then record the verified current guardian's article-specific written permission and the approved scope. The evidence reference remains private. Any edit requires consent for the new version. Guardians can withdraw through **Account → Journal publication consent**; public articles, sitemap inclusion and image requests recheck consent/current guardian relationships. This does not replace the organization's obligation to obtain valid consent or infer editorial permission from roster consent.

Images reuse PostgreSQL storage with a dedicated editorial media relation. Raster uploads are decoded, metadata-stripped, resized within 1280×1280, re-encoded as WebP and capped at 1 MB (4 MB input, 20 MP decode limit). The direct `sharp` dependency is necessary for actual decoding and metadata removal. Public image responses never bypass current publication/consent through caching. Video frames load only after a reader chooses to connect to the allowlisted provider.

Search uses an indexed public-manuscript text vector. Public list responses omit full article bodies; publication responses explicitly exclude private consent, account IDs and planning notes. Slugs are reserved and resolve directly to an article, so historical redirects cannot form chains or loops. The dynamic sitemap preserves the previous public destinations and includes only visible, indexable articles. Failed article loads show retryable errors; no database failure is converted into an empty newsroom.

The scheduled Netlify function runs only in production and rechecks the exact approved revision, current publisher/reviewer permissions, references and guardian consent. It never approves a draft. Failed checks leave the article unpublished/scheduled for owner review and create an audit event.

## Verification evidence and release receipt

Local isolated regression suite: 12 passing tests covering default-deny grants, owner authority, coordinator scope, optimistic conflicts, exact approvals, slug collisions/redirects, restoration, scheduling/revocation, image processing/access, guardian relationships/withdrawal and unchanged team pricing/payment records.

Built-app browser walkthrough: synthetic owner creates an article, uploads an image, chooses a category, previews privately, submits, approves, publishes, verifies public SSR/SEO/sitemap and 375/390/768/1024/1440 layouts, then unpublishes. Anonymous draft and image URLs return 404. Screenshots contain fixtures only. `scripts/journal-walkthrough.mjs` is added to required CI without removing existing gates.

Typecheck, build and built-SSR nonce/cache checks were exercised locally. Full required CI and the exact hosted preview/production receipt must be recorded on the release PR before claiming deployment. The previously released main commit `5dcac40` was verified published on 2026-10-24 at 03:16:19 UTC; the Journal is a separate release.

## Editorial and measurement handoff

- First six drafts need real author/reviewer assignment, coach/owner fact-checking and any desired real imagery. The academy mission/facility/history statements require owner confirmation. No coach interview, outcome, testimonial or customer photo was fabricated.
- Pitching draft research consulted the current [MLB/USA Baseball Pitch Smart guidelines](https://www.mlb.com/pitch-smart/pitching-guidelines) and [AAP overuse-injury guidance](https://www.healthychildren.org/English/health-issues/injuries-emergencies/sports-injuries/Pages/Preventing-Overuse-Injuries.aspx) on 2026-10-24. Source verification remains an explicit human publication gate, not an automatic stamp.
- The twelve-story initial roadmap is recorded in assignment notes by relative editorial week. No publication date or appointment was invented.
- Optional aggregate views/CTA counts default off. They do not represent unique visitors, bookings, revenue or verified conversions. Privacy signals are honored; external video connections require reader action. GA4/Search Console authentication and provider metrics remain unavailable, visibly labeled; no credentials or metrics were fabricated.
- External analytics authorization, real article approvals and article-specific guardian consent are the only content/account inputs needed from the owner. Real-device accessibility and field performance monitoring remain ongoing operational validation, not claims made by Chromium fixtures.
