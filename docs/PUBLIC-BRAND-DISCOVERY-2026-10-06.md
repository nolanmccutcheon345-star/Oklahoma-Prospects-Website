# Public brand and discoverability continuation — October 6

Base: main e7f5515a3e8af1684f8e1fbc300183cda05d5ba2. This independent branch contains no financial workflow, database migration, hosting environment or scheduler change, and requires no Square sandbox payment acceptance.

## Owner/audit traceability

- W1 / GB-02: canonical public name Oklahoma Prospects Academy in the shared club configuration, header accessibility/visible label, default document title, route SEO/social metadata, local-business schema, social-card metadata, footer, facility lane labels, receipt labels, review-search link and Contact page. Keep the domain/project/repository, phones, email, address and hours. Prospects remains a compact abbreviation. Public business naming does not establish a legal entity name; remove the unsupported legalName field rather than asserting a new legal name.
- W2: Contact promises a response without any response-time commitment.
- GB-03a: FAQ correctly says baseball/softball is selected when each athlete is added to the account; it no longer implies /book has a sport selector.
- GB-04a: add the existing public /softball route exactly once to sitemap.xml.
- D-005 / GB-08: forced permanent Netlify /train -> /training redirect preserves old inbound training links.

## Scope and continuity

Claimed files: netlify.toml, public/sitemap.xml; club.ts, seo.ts, local-business.ts, og/site.json; app-shell.tsx, site-footer.tsx, google-review.tsx, facility-lanes.tsx, club-receipt.tsx; __root.tsx and contact.tsx. Header/root edits only change branding and preserve D-001's independent layout patch. Route-specific legacy body copy and fundraising labels still need a later brand sweep; this is not a claim that every historical mention, image asset or external listing is corrected.

Existing PRs and branches were not modified. Git merge-tree verifies clean integration with exact inspected heads of #26, #27, #30, #33, #25 and #18. Old #19 already conflicts against unchanged main in teams.tsx/tryouts.tsx; those files are not edited by this branch, and its reconciliation remains separate. Do not bulk merge the old reconciliation drafts.

## Verification and remaining work

TypeScript PASS; changed-file lint PASS; Netlify preview-context build PASS; built SSR CSP/nonces/private-cache checks PASS. Parsed Netlify configuration confirms one forced 301 /train -> /training rule; parsed sitemap confirms one unique softball entry and no duplicate URLs. Built homepage/training/contact/softball checks verify canonical title, header, footer and local-business schema. Contact follows its existing 307 normalization to ?subject= and then shows the no-time response promise. Browser/hosted exact-commit checks and current GitHub CI results belong in the PR.

This slice does not enable lesson checkout or change prices/policies, fabricate tryout dates, publish staff/player information, edit external listings, send requests/messages or waive the dependency audit. Admin-managed tryouts/all-age intake, coach profiles, player access, fundraiser consent/navigation, youth/setup rules and actual cage mapping remain tracked owner requirements. Production publishing is authorized; record an actual merge/publish/live verification separately. A1 reconciles this branch into the single backlog on Thursday.

## W13 continuation — homepage fundraising removal

Removed the homepage hero's Donations & sponsorships button and the shared footer's Donate & sponsor link. Homepage visitors are no longer directed to the aggregate fundraiser page by these prompts. Existing donation pages and consent work remain separate (PR36); no donor/payment records change. Verify the rendered homepage contains no fundraising link or donation prompt. Public team/roster/player routes still need explicit links between fundraising records and actual team/roster IDs; age labels are not authoritative team mappings. Public consent checks remain mandatory for those routes.

## Release integration

Integrate main `6dfbcb8abf8303fc131f75d7b028938a0e22b7ed` (the live PR #35 dependency remediation) into this owned branch without rewriting or deleting prior commits. Update the navigation regression's obsolete footer donation-link expectation to the retained Contact link; removal is the approved W13 behavior. Preserve the rest of the existing navigation coverage. Full regression checks and exact-head CI/hosted results are recorded in PR #34 before release. No Square acceptance is waived; this branch changes public branding/copy/navigation only.
