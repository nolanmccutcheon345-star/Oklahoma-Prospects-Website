# Membership presentation and homepage integration

Baseline: main 77bbaf9244a4a5b897674d8723f019454ebd08a9. Existing club_services, operational publication, financial owner authorization, Square order snapshots, public people, team pricing, and brand assets remain authoritative.

Acceptance: server-rendered public prices; independent checkout availability; shared card calculations and previews; cage entitlement display derived from the credits actually fulfilled; owner presentation controls and publication/audit; up to three existing published coaches; consented testimonials with withdrawal; public mobile menu without disrupting private workspaces/booking controls; no historical price seeding or team add-on exposure.

Migration 0101 adds presentation and website content storage only. It does not overwrite prices, credits, paid orders, subscriptions, team budgets, or agreements. New homepage content starts empty. Owners select coaches and provide authentic consented testimonials; no fabricated content is seeded.

All current cage passes are monthly household cage credits. The existing redemption rules exclude fielding areas and team practices. Comparison settings cannot expand those entitlements. Current credits (hours × 60 minutes) remain the fulfillment authority; editable included hours update compatible fields together for future purchases only. Existing paid snapshots stay intact. Finite allowances may be compared at included or lower assumed usage; unsupported comparisons are hidden.

## Administrator workflow

Front Office → Services & Pricing retains the existing service editor and price authority. Edit a cage membership to manage its description, included monthly hours, structured benefits/icons, badge, ordering, publication, comparison resource and visibility toggles. Draft/archived cards are unavailable for new purchases; existing paid entitlements are preserved. The preview uses the same calculation and card as the public site. Changes use revision checks and audit history.

Homepage Settings, below the existing service editor, selects zero to three currently published coaches in display order. The cards follow the existing profile, photo, roles and lesson availability. Unpublishing a profile removes it from the homepage automatically. Testimonial publication requires recorded consent; withdrawing consent removes the public quote. Only public quote/attribution/team fields leave the server. Website publication uses the existing verified financial-owner authorization, without adding grants or broadening coordinator permissions.

The existing public Team Development plans remain on the memberships page. The separate team-player fee add-on is not added to any public membership comparison. Line-art rental cards reuse current rental records. Public navigation uses a mobile Menu/Book header; private workspace navigation is retained.

## Validation record — 2026-10-24

- TypeScript, production build, built SSR/security checks, lint (zero errors), and dependency audit (zero vulnerabilities) passed locally.
- Shared-catalog tests cover SSR data, a single shared load, independent checkout failure, error/empty/retry, stale responses, and route revalidation.
- Pricing/content integration tests cover integer-cent comparisons, actual credit entitlements, invalid comparisons, publication, stale revisions, current owner authorization, unchanged paid records, coach publication, consent withdrawal and public-data minimization.
- Built-app membership/homepage walkthrough passed at 375, 390, 768, 1024 and 1440 pixels. It edits a membership, verifies prices/credits are unchanged, selects an existing coach, publishes a synthetic consented testimonial, and withdraws it.
- Public navigation walkthrough passed at eight widths from 320 to 1440 pixels, including keyboard/focus/Escape behavior and 200% text. Isolated coordinator, tournament finder, and authenticated guided-lesson walkthroughs passed.
- Full regression suite and remaining release gates run in the pull request. Local PGlite security tests pass under the repository's Node 22 CI runtime. Screenshots contain synthetic fixtures, not current production prices or customer records.

Release receipt belongs in the pull request after exact-head CI, isolated Netlify preview, production commit/release manifest, hosted checks, and both-domain checks. A build alone is not release evidence. No real payment, customer account or email delivery is used for validation.

## Responsive layout follow-up

The shared rental and membership cards, owner-managed coaches/testimonials and homepage integration already landed in PR #227. The follow-up retains those components, current catalog prices, resource IDs and booking links. It adds the existing approved facility photograph to the homepage facility section and exposes the header booking action on desktop as well as mobile.

The old 4.25rem header assumption did not account for the new wrapped mobile header or desktop navigation row. Header and booking-review heights now update shared CSS offsets when their rendered size changes. Anchor/focus clearance, desktop menus and Front Office sticky headings use those offsets. Public routes reserve no staff tab-bar space; staff workspaces retain their existing navigation. Payment headers and short-viewport headers stay in document flow. The booking review action also stays in flow while a form field is focused, and its clearance is removed when leaving booking.

Acceptance coverage extends the existing real-app browser walkthroughs: eight widths, enlarged text, actual header clearance, a completed synthetic booking selection, focus/short-viewport overlap checks, payment-route cleanup and preservation of the Front Office mobile controls. Provider charges and real customer records are not used.
