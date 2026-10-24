# Team budget master

The administrator's supplied October 2026 matrix seeds 120 rows: baseball and softball, 6U–17U, Winter / Spring / Summer / Fall / Spring + Summer. Detailed cost rows are authoritative; example baseline price tables are derived references, not checkout prices.

## Administration

Open Team Fees & Profitability → Master budget defaults. Edit the row for a sport, age and season or edit common defaults, then Save master defaults. Each save uses a revision check and audit record. The editor remains available before any teams exist.

Team creation atomically saves a matching draft budget and its master row/revision snapshot. New-team defaults include coach compensation, insurance, background checks, balls, equipment, operations, miscellaneous expenses, fields, Team & Development Program Fee, organization fee, baseline, contingency, hotel rate and upward rounding. Single seasons and Spring + Summer in the same year match automatically. Unsupported ages or ambiguous season combinations require manual admin setup. A failed team save cannot leave an orphan budget.

Existing plans are not overwritten by master changes. Admins may apply a selected row to an unpublished draft; published fees require individual edits. Ordinary team edits override the snapshot. Coaches cannot edit the master or private pricing. Their assigned schedule entries and uniform choices feed draft costs.

## Before publication

Enter season dates. Select the actual uniform package and vendor cost (or explicitly confirm no uniform is required). Record entry fees once per tournament, with zero on its individual games. Noncancelled schedule entries and selected catalog events in the season determine the automatic entry total; generated catalog mirrors are excluded to prevent duplication. Admins can disable automatic entry totals for a manual override.

Confirm schedule, gas, hotel, other direct costs and processing reviews. Schedule changes clear schedule/hotel review. Pending costs start at zero and are not an approved quote. Actual processing rates and fixed charges must be reviewed; no payment-provider rate is invented. Admins can select gas presets or enter a custom amount. Hotel nights use the team's admin-controlled nightly rate. Coaching premiums add to matrix head/assistant cost lines. Additional staffing, mileage, meals and software/admin start at zero for actual approved expenses.

Costs plus uniforms receive contingency, then Team & Development Program and organization fees are added, processing is allowed for, and the player fee rounds upward to the configured increment. Extra players do not reduce the original baseline fee. Rounded margin is separate from the processing allowance. Existing accepted player fees remain locked and payments retain their approved checkout amounts.

## Business projections

The monthly business allocation report uses active players with accepted fees and recorded payments in teams overlapping the selected reporting month. Season contribution is spread over configured months. Facility overhead is itemized by month: lease, utilities, maintenance, software, cleaning, equipment, other staffing and other costs. Admins can select existing accounts for named monthly staffing estimates. Active entries contribute once; inactive entries remain editable but are excluded. Account names are resolved on the server and no payroll payments, invitations or permissions are issued.

The master contribution rule can be automatic by paying-player share, a percentage of total monthly facility overhead, or a fixed monthly dollar amount. Team Fees → Facility overhead contribution lets admins override each team or restore master inheritance. Percentage and fixed contributions multiply by configured billable season months, including fractional months. Inherited rules follow current master changes; explicit team overrides persist. Financially closed plans retain their saved season overhead.

The monthly report shows configured team allocations and any uncovered or excess allocation. Fixed and percentage rules are not silently normalized. Company overhead is deducted once when calculating company-wide net funds, regardless of the allocations. Automatic mode retains the prior player-share report and manual per-team season estimates. With no paying players, automatic overhead remains unallocated. Allocation is from existing team revenue; it does not add a family fee or alter accepted checkout amounts.

Reserve uses the master contribution rate, actual reserve balance and target. It is capped by available net funds and the remaining target; the after-target rate applies once the target is reached. These are forecasts, not transfers or an automatically updated bank balance. Team contingency stays separate. Legacy manual season overhead/reserve fields and scenario calculators remain explicit estimates/overrides, not additional automatic charges.

## Verification

Synthetic database coverage checks seeded migration values, admin-only master access, concurrent edits, preservation of existing plans, apply-default controls, schedule costs and review/publish gates. Formula tests cover reference floors, rounded processing, coach premiums, baseline protection and company allocation. Rendered UI tests check the 120-row editor, saving, availability without teams and hidden admin controls for coaches. No real customer payments are created during tests.

## Fee health and publication safeguards

Fee Health appears beside the calculated player fee. It reports funding shortfall, pending review items, membership/organization target coverage and readiness. The server independently enforces the checks; hiding a control cannot bypass them. Payment policies, deadlines, cost review, processing and actual facility-overhead review are required. Expense/payroll changes clear the master overhead review; save changed costs, then explicitly confirm and save the review. Profit projections remain provisional until reviewed.

A Spring matrix row spanning into July or later is blocked. Applying a different master row to an unpublished draft also updates the team's season classification using the season start year. This is an explicit admin decision: the application does not infer the intended competitive season from an old export. Confirm Spring + Summer or shorten Spring-only dates.

New matrix teams default to full-player-only pricing. Legacy softball plans also require an explicit admin PO opt-in. PO controls and new offers disappear when disabled; server role assignment and acceptance reject unsupported PO slots. Existing accepted agreements are preserved. Resolve any unaccepted PO roster assignments before publishing full-only fees.

Gas remains zero/pending until schedule review. Uniform omission requires an explicit review plus a written reason (for example, returning players reusing uniforms). Zero processing rate and fixed fee require a reviewed, written explanation; no processor rate is guessed.

For the default 40/30/30 schedule, blank Payment 2 means the midpoint between actual acceptance and the final deadline. An explicit date remains an admin override. Exact dates are locked with the accepted agreement. Acceptance after the final deadline is blocked pending office review. Custom schedules keep their explicit dates and amounts.

The generated `budget-matrix-validation.md` validates all 120 supplied rows. It is a code-default report, not a statement that a live team's schedule, actual overhead, or processor contract has been confirmed.

## Linked pitcher-only pricing

New and working drafts use PO model 2. Full and PO players share the same cost component at the ten-full-player baseline. Costs include coaching premiums, schedule entries, travel, hotels, uniforms, per-player expenses and contingency. More players do not dilute that baseline. The required Team & Development Program Fee defaults to $150/month for both full and PO players. Personal memberships are purchased separately through the site at the full published catalog price. Team pricing has no personal-membership option or retail-reference input. PO organization defaults to 60% of the age/season full organization fee, rounded up to $25, across both sports' 120 rows.

Master Defaults and individual admin team budgets expose separate PO Team & Development Program and organization amounts, plus team, uniform, contingency and processing allocations (100% each). Percentages apply to the matching shared cost component; processing applies to the PO's own card charges. Below-100% allocations or a zero PO organization fee require an explicit admin explanation before publication and show a subsidy warning. Actual processor expenses remain in the profit calculation even when the fee allowance is discounted. The preview lists the full and PO common components, membership allocations, pre-processing discount and subsidy.

Legacy master records acquire these defaults on read, then persist with the next admin save. Legacy working team drafts upgrade without overwriting positive explicit PO organization amounts. Published-budget snapshots and accepted fee/payment locks retain their original values and legacy calculation. Changing a working draft does not republish fees or reprice accepted players. PO is still opt-in on newly created teams.

Net Additional Player Contribution deducts uniform cost, processing and true incremental player expenses once. Insurance and tournament registration are team-level expenses by default; admins can record actual additional-player surcharges. No fixed expense or second contingency allocation is deducted from that marginal report. It includes that player's membership and organization revenue; it is not pure profit. Program revenue recognition on new PO acceptances uses the PO membership rate, with existing locked allocations preserved.

### Roster fee types and PO limits

Staff must explicitly choose Full / Position Player or Pitcher Only when adding a roster player or making/accepting a placement offer. Parents cannot change this assignment to obtain a different fee. Published acceptance selects the amount using the assigned roster role; agreed fees cannot be changed by editing that role.

PO defaults: 1 spot for 6U–14U, 4 for 15U–17U. Admins may override the count (including zero) in that team's PO settings; blank restores the age default. Coaches can see the limit but cannot edit it. Teams must also explicitly offer PO spots. Active PO placement offers reserve capacity until accepted onto the roster or moved out of Offer status. Validation runs on the server against roster players plus pending offers, and club writes serialize with fee-plan edits so concurrent additions cannot exceed capacity. Lowering a team's limit below its active players/offers is rejected until staff resolve the assignments. Existing players are never automatically removed or repriced.

## October 21 pricing interpretation (program model 3)

All 120 age/sport/season cost rows and approved PO organization values are retained. The baseline remains ten; 15% Team Contingency remains direct costs × 15%. Contingency is neither markup nor profit. The $24,000 business operating reserve is independent and continues to restrict distributions.

Full-player season fee: (direct team costs + Team Contingency) ÷ baseline + required Team & Development Program Fee × Actual Billable Months + approved organization fee + processing, with the existing upward rounding rule. Personal memberships are separate full-price purchases and add nothing to the team fee. PO players retain 100% team/uniform/contingency/processing allocations and their existing organization matrix.

Default Months is template metadata. Actual Billable Months counts inclusive calendar months in the team's actual program dates: February 10–July 10 = 6, January–July = 7. A private owner/admin override supports fractional months and requires a written reason before publication. Prorated service recognition is unchanged and is not the billing rule. Date changes recalculate months on both client and server. Legacy published snapshots and accepted amounts retain their historical interpretation; only working drafts acquire model 3.

The $150 program includes scheduled team facility use and platform-delivered strength/athletic, throwing/arm-care, position/age-specific programming when assigned, drills, tracking, coach access and development history. Normal team coaching administers it; no direct programming labor cost is created automatically.

Publication freezes full-player and PO prices and matching installment schedules. Acceptance locks the program and organization allocations, amount, service dates and schedule. Custom dollar schedules preserve their proportions and dates. Unearned program allocations and any historical signed service allocations remain protected in both team and Finance reports. No existing agreement is repriced and no live charge is made by this change.

Reports distinguish Team Operating Contribution (team operating revenue less team expenses), Organization & Program Revenue (organization + program + selected access), and Total Team-Associated Contribution (their sum). Forecasts clearly use projected costs; actual reporting uses collections, frozen component allocations and recorded paid/unpaid team expenses. Historical collections with missing allocations require reconciliation before the three-part actual breakdown is shown. Protected contingency and business overhead/reserve are deductions from funds available for distribution, not organization/program revenue. The current-roster marginal table shows each additional player's fee less uniform, processing, registration, insurance and other true incremental expenses; it never charges fixed team insurance or team registration again.

## Editable defaults and row inheritance

Admins can change the saved common program fee, PO program fee, baseline, contingency, hotel and rounding values in Front Office at any time. Pricing overrides for the selected age/sport/season row support these values and PO cost-allocation percentages. Blank inherits the saved common value; zero is an explicit override. All 120 original cost rows remain intact. Row overrides apply only to their selected row and preserve approved full/PO organization fees unless explicitly edited. The calculator reads the saved row/common values, never a fixed mandated program-fee amount. Those amounts are initial defaults only. The explanatory copy displays the current saved values.

Use Save master defaults, reload to confirm persistence, and apply the desired row explicitly to an existing unpublished team draft. New teams receive the matching saved row automatically. Master saves cannot change an accepted agreement or silently republish a family price. Authorization, optimistic revision checks and audit records remain mandatory on the server.
