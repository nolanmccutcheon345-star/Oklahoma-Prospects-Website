# Program allocation pricing correction

## Demonstrated defect and approved result

The 13U agreement and Front Office expense entries both contain $17,930 in external direct costs. The discrepancy comes from a five-month billing override and adding the required program allocation after contingency. No expense categories need to be invented or replaced.

For the approved ten-player example: six billable months at $100 gives a $6,000 team program allocation; direct costs are $23,930; 12.5% contingency is $2,991.25; the protected budget is $26,921.25. Add $500 per player in organization fees, gross up for 3% processing, and round each player upward to $25: **$3,300**, paid **$2,310 / $495 / $495**. The team's 16/12/6-week offsets remain authoritative. Global release rates and other owner overrides are not replaced with this team's rates.

The service dates remain February 1–June 25, 2027. They cover five calendar months. The separately documented, owner-approved billing term is six months, entered through the existing override and reason fields. Revenue recognition continues over actual service dates.

## Implementation and accounting

- New and working draft budgets use `programCostModel: 1`. The required program allocation enters direct costs once and receives contingency. The organization fee stays outside contingency. PO players fund their own configured program rate; shared-cost subsidies remain visible.
- Raw historical budgets without this marker retain the prior formula. Published snapshots, accepted amounts, installments, service allocations, payments, and closed plans are not rewritten. A changed model or billing term requires publication review.
- Reports show external costs and internal program allocations separately. The program allocation is a team cost and academy revenue. Consolidated profit deducts external expenses once. Cash protection continues to reserve external obligations and deferred program revenue separately, avoiding a duplicate reserve for the same internal allocation.
- All arithmetic remains integer cents. Dividing the protected budget among ten players reserves five extra cents in aggregate. Processing reserves apply to the final rounded fee and allow installment cent rounding; they are not the approximate processing gross-up on an unrounded agreement worksheet. No Square rate or charge behavior changes.
- The existing financial command path persists changes with audit history and financial-version checks. No direct production database rewrite or migration is required.

## Acceptance and activation

Regression coverage includes the exact $3,300 calculation, historical $3,125 preservation, six-month billing versus five-month service dates, 70/15/15 installments, all 120 master rows, differing PO rates, roster expansion, consolidated accounting, deferred revenue, frozen financial contexts, and the existing permission boundaries. React component tests exercise editing and saving estimates.

Deploy the code after required checks pass. Then save only the authorized 13U draft's six-month override and explanation through Front Office, reload, and verify the itemized amounts. Do not publish a parent offer until the actual first event, policies, cost reviews, and overhead requirements are complete. This release does not claim those reviews occurred and does not change any accepted agreement.
