# Team fee publication and configurable estimates

## Behavior

- Common and per-age/sport/season master pricing remains editable in Front Office. Blank row overrides inherit saved common amounts; explicit zero is retained. Existing cost matrices and accepted agreements are preserved.
- Families and linked athletes receive a team quote only from an explicit owner/admin publication. Draft player prices and payment placeholders are withheld. Assigned coaches may calculate proposals; other teams' accounts cannot read them.
- Publication requires reviewed schedule/entry fees and an active uniform selection. Admins can instead enter explicit tournament fees (team season total) and/or a uniform fee per player in that team's fee settings. Zero is an explicit decision, never an inferred free season.
- Estimates replace the corresponding schedule/package costs in the existing calculation, including full/PO allocation, contingency, processing, projections and marginal-player reporting. Clearing an estimate restores the underlying schedule/package inputs. Save and inspect the result before publishing.
- Schedule and master edits never silently replace a published quote or an accepted agreement. Owner publication is team-specific. Accepted totals, payment dates, signed service allocations and financial history remain locked.
- Coordinators with current roster-read scope can see an allowlisted published team price in that team's roster workspace. This does not grant budgets, master settings, other-team prices, household balances, receipts or publication rights. Suspension and scope changes apply to the next request.
- Public team pages contain no team or player pricing. Parents see only their own athletes' accepted payment records. Players and coaches see published team prices without other households' ledgers.

## Verification

Synthetic regressions cover publication rejection for missing schedules or fees, unpublished family responses, anonymous and cross-team denials, scoped coordinator projections/revocation, source selection after financial activation, explicit-zero estimates, no duplicate cost allocation and immutable accepted fees. Standard typecheck, Netlify build, built-server validation and required GitHub workflows apply before release.

Production master defaults were saved through the owner's Front Office and confirmed after reload: full and PO Team & Development Program Fee $150/month, ten-player baseline, 15% Team Contingency and separate $24,000 business reserve target. All 120 existing live matrix rows were retained. No live team quote or payment was created for testing.
