# Oklahoma Prospects — unification Session 1

Scope: prospectsbaseball.club marketing site only. Booking, the player development
portal, and existing hosted family tools were not modified or deployed.

## Implementation

- Existing static HTML/CSS/JavaScript stack and self-hosted Barlow Condensed / Inter.
- `_includes/header.html`, `footer.html`, and `mobile-nav.html` share the club chrome.
- `scripts/sync-chrome.mjs` stamps that chrome into all 15 public HTML pages at build
  time. Navigation, phone links, and active-route states work without JavaScript.
- `assets/brand-tokens.css` contains the approved ink, navy, maroon, and powder colors.
- `assets/shared-chrome.css` contains the persistent header, safe-area mobile nav,
  homepage intent layout, schedule, and placeholder page styling.
- `index.html` starts with the supplied hours, headline, cage CTA, tryout CTA,
  proof row, address, and desk number. Hours are static reservation hours, not a
  claim about live cage availability or whether staff are physically present.
- `teams.html` has the exact November 14–15, 2026 evaluation schedule, November 21
  makeup note, and 15-minute early arrival instruction. Its registration link uses
  the live booking root; that page has no exact `#tryouts` anchor.
- `visit.html` and `waiver.html` are information pages. No waiver form was rebuilt.
- Existing tryout inquiries, facility/lane details, recruiting, and parent links
  remain. Waiver and check-in links lead to the new local information stubs.
- `_redirects`, `sitemap.xml`, `site.webmanifest`, and shared page metadata are updated.
- Rental prices remain $50 / $60 / $75. No membership math or Prompt 02 work added.
- No reviews, ratings, alumni, coach biographies, rosters, or fees were invented.

## Editing this repository

This repository contains only the marketing site. Edit `index.html` for the
homepage, `teams.html` for tryouts, and the other root HTML files for their pages.
Edit `_includes/` for shared navigation and footer content, then run
`node scripts/build.mjs` to update all pages and generate the publish folder.
Shared colors are in `assets/brand-tokens.css`; layout is in
`assets/shared-chrome.css`. Keep the self-hosted fonts and their license files.

Use a branch for changes and review them before merging. A GitHub commit does
not automatically publish to the current live site: Netlify deployment remains
manual until a Git connection is explicitly configured. Keep `.env` files and
Netlify credentials out of Git. No package installation is required for the
static build; use Node.js 22 or later.

## Deploying changes

From this directory:

    node scripts/build.mjs
    npx netlify deploy --no-build --dir dist --site c49ad0ab-1b2c-412e-88d9-1f6ddf490a17

Inspect the draft at 390 × 844 before publishing:

    npx netlify deploy --prod --no-build --dir dist --site c49ad0ab-1b2c-412e-88d9-1f6ddf490a17

`netlify.toml` runs the same static build when Netlify performs the build.
`scripts/build.mjs` copies only public HTML, assets, route rules, and site metadata
into `dist`. Templates, scripts, this README, and local state are never published.

## Verification status — September 14, 2026

Passed: all 15 HTML pages have the five required links in shared desktop/mobile
navigation, the local links/assets resolve, there is one H1 per page, the new route
rewrites exist, current-route attributes are present, and prohibited UI names/phone
numbers are absent. JavaScript syntax checks passed. The original facility lane
table, rate values, and existing contact/tryout form fields were preserved.

Published: production deploy `6aa7907b2b404deee99d9b5a` on
https://prospectsbaseball.club/. The live homepage shows the new intent screen.
All 14 public content routes returned HTTP 200; missing routes use the shared
404 page. `/teams`, `/visit`, and `/waiver` are live, not just preview routes.

Rendered browser checks passed at a 390 × 844 CSS viewport: hours, cage CTA,
and address are visible without scrolling; the bottom nav has five targets at
least 44px tall. A narrower 320px viewport and desktop layout were also visually
checked. Mobile Teams and Visit navigation was exercised, and the cage CTA was
clicked through to the existing live availability calendar in the same tab.
These are browser viewport checks, not a claim of testing on a physical iPhone.

The production upload includes only the explicit `dist` build. Preview-only QA,
templates, and scripts return 404 on the live domain. Local Netlify state and credentials
are not part of the public build or source archive. All files outside the marketing
site compare byte-for-byte unchanged with the recovered pre-session source.

Booking, the player development app, payments, and email were not modified or
end-to-end tested in this session. Prompt 02 has not been started.
