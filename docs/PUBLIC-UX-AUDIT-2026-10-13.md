# Public experience and roster privacy release — 13 October 2026

Owner instruction: apply the two supplied audit documents, update GitHub and publish the existing Netlify site. Base: `4c5a59acb7c6bafc2e0dbf26f95c5a0a56b626b3`. This incorporates the complete proposed changes from draft PRs #202 and #203, with additional review and improvements below.

## Implemented

- Public roster projection fails closed unless the current, exact public-roster agreement has a signer, signer email and valid signature timestamp and is not revoked. Withdrawn players remain excluded. Private statistics retain their existing authorization rules.
- Linked guardians can withdraw roster-publication consent, preserving the signed record, team membership and private history. Revocation uses authenticated server functions, household authorization and optimistic revision checks. Signing again creates a fresh agreement. No existing consents or customer records are changed by deployment. Names without qualifying team consent will no longer appear publicly.
- Mobile navigation uses a native modal sheet with an explicit close button, background dismissal, Escape support, focus containment/return and safe-area spacing. Desktop navigation lives in the header. Train and Teams include their landing pages and ordinary navigation links.
- Homepage retains its headline and brand, with four clear destinations: cages, coaching, account, and team/tryout requests. Season wording uses the current shared season constant.
- Training finder uses published instructor/service coverage, age range and discipline. Server-verified athlete selection appears before lesson choices. Age/assessment/payment eligibility remains enforced by existing server rules; the 11-and-under exception is retained.
- Tryout requests use three steps, retain values while going back, review details before sending and prevent repeated submission. Sarah's recently approved mandatory positions, notes and USSSA status requirements are preserved. The report's proposal to make them optional was expressly conditional on staff workflow review and does not supersede those requirements.
- Cage booking groups existing selections into spaces, time, and review. Advancing moves focus and scroll to the next section. Quote, multi-lane classification, availability and payment confirmation rules are preserved.
- Camps, coaches and instructors share current academy branding. Camp facts and full-camp/day prices are easier to scan; longer schedules expand. Profiles use real supplied photos or initials, consistent metadata and clear availability actions. Unreported or invalid team records no longer display as meaningful 0–0–0 results.
- Privacy page now describes persisted inquiries, athlete/development records, account permissions, payment processing, device storage and requests for correction or withdrawal. This is an operational description, not a claim of attorney approval.

## Verification and release gates

- Focused consent tests cover missing, outdated, unsigned, malformed, mismatched and revoked consent; household authorization; withdrawal persistence; re-signing; private field exclusion; and unchanged team membership.
- Built public browser walkthrough uses disposable migrated data: 320/390/430/768/1280 widths, keyboard navigation and focus return, sport/age selection, mandatory tryout fields, Back preservation, exactly-once persisted request across reload, and cage step progression. Screenshots reviewed; no browser errors in the successful run.
- Existing authenticated built instructor walkthrough and full regression suite remain release gates. Existing assertions tied to replaced UI labels/menu shape are updated while retaining access and purchase checks.
- Added the public browser walkthrough to CI. Job timeout increased from 15 to 20 minutes to include this additional real-browser gate; no verification gate removed.
- Fixed a reproduced session-hydration race: the shared auth hook now renders the same pending view on the server and first client render, even when the session arrives early. Protected server authorization remains unchanged. A hydration regression exercises an already-resolved client session.
- No dependency changes, payment-provider configuration changes or new database migrations.
- GitHub PR and Netlify release receipt will identify the exact tested and published commit. Production is verified against `/release.json` plus hosted HTTP/security checks.

## Limits and outstanding business acceptance

- No production database export or private customer-session access was used. The number of production roster identities affected by the fail-closed gate is not asserted. Historic waiver-only consent is not automatically converted into a team agreement.
- Existing payment, role, booking, refund and idempotency regressions use isolated fixtures. This release does not certify a new live Square charge/refund or a provider-backed sandbox transaction, nor enable unavailable memberships or products. Public checkout readiness is not evidence of a completed transaction.
- Attorney review of terms/privacy and substantiation of the coach's absolute scholarship claim require qualified human input. Existing terms-review notices and source biographies are preserved; no claim of legal approval or newly verified credentials is made.
- Keyboard and responsive Chromium checks do not certify VoiceOver or all WCAG 2.2 AA criteria. Field Core Web Vitals, Search Console/local listing ownership, and conversion analytics were not available as part of this code release. No new tracking of minors is introduced.
