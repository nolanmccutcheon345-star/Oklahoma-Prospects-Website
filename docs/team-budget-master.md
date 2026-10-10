# Team budget master

The administrator's supplied October 2026 matrix seeds 120 rows: baseball and softball, 6U–17U, Winter / Spring / Summer / Fall / Spring + Summer. Detailed cost rows are authoritative; example baseline price tables are derived references, not checkout prices.

## Administration

Open Team Fees & Profitability → Master budget defaults. Edit the row for a sport, age and season or edit common defaults, then Save master defaults. Each save uses a revision check and audit record. The editor remains available before any teams exist.

Team creation atomically saves a matching draft budget and its master row/revision snapshot. New-team defaults include coach compensation, insurance, background checks, balls, equipment, operations, miscellaneous expenses, fields, membership, organization fee, baseline, contingency, hotel rate and upward rounding. Single seasons and Spring + Summer in the same year match automatically. Unsupported ages or ambiguous season combinations require manual admin setup. A failed team save cannot leave an orphan budget.

Existing plans are not overwritten by master changes. Admins may apply a selected row to an unpublished draft; published fees require individual edits. Ordinary team edits override the snapshot. Coaches cannot edit the master or private pricing. Their assigned schedule entries and uniform choices feed draft costs.

## Before publication

Enter season dates. Select the actual uniform package and vendor cost (or explicitly confirm no uniform is required). Record entry fees once per tournament, with zero on its individual games. Noncancelled schedule entries and selected catalog events in the season determine the automatic entry total; generated catalog mirrors are excluded to prevent duplication. Admins can disable automatic entry totals for a manual override.

Confirm schedule, gas, hotel, other direct costs and processing reviews. Schedule changes clear schedule/hotel review. Pending costs start at zero and are not an approved quote. Actual processing rates and fixed charges must be reviewed; no payment-provider rate is invented. Admins can select gas presets or enter a custom amount. Hotel nights use the team's admin-controlled nightly rate. Coaching premiums add to matrix head/assistant cost lines. Additional staffing, mileage, meals and software/admin start at zero for actual approved expenses.

Costs plus uniforms receive contingency, then membership and organization fees are added, processing is allowed for, and the player fee rounds upward to the configured increment. Extra players do not reduce the original baseline fee. Rounded margin is separate from the processing allowance. Existing accepted player fees remain locked and payments retain their approved checkout amounts.

## Business projections

The monthly business allocation report uses active players with accepted fees and recorded payments in teams overlapping the selected reporting month. Season contribution is spread over configured months. Facility overhead is itemized by month: lease, utilities, maintenance, software, cleaning, equipment, other staffing and other costs. Admins can select existing accounts for named monthly staffing estimates. Active entries contribute once; inactive entries remain editable but are excluded. Account names are resolved on the server and no payroll payments, invitations or permissions are issued.

The master contribution rule can be automatic by paying-player share, a percentage of total monthly facility overhead, or a fixed monthly dollar amount. Team Fees → Facility overhead contribution lets admins override each team or restore master inheritance. Percentage and fixed contributions multiply by configured billable season months, including fractional months. Inherited rules follow current master changes; explicit team overrides persist. Financially closed plans retain their saved season overhead.

The monthly report shows configured team allocations and any uncovered or excess allocation. Fixed and percentage rules are not silently normalized. Company overhead is deducted once when calculating company-wide net funds, regardless of the allocations. Automatic mode retains the prior player-share report and manual per-team season estimates. With no paying players, automatic overhead remains unallocated. Allocation is from existing team revenue; it does not add a family fee or alter accepted checkout amounts.

Reserve uses the master contribution rate, actual reserve balance and target. It is capped by available net funds and the remaining target; the after-target rate applies once the target is reached. These are forecasts, not transfers or an automatically updated bank balance. Team contingency stays separate. Legacy manual season overhead/reserve fields and scenario calculators remain explicit estimates/overrides, not additional automatic charges.

## Verification

Synthetic database coverage checks seeded migration values, admin-only master access, concurrent edits, preservation of existing plans, apply-default controls, schedule costs and review/publish gates. Formula tests cover reference floors, rounded processing, coach premiums, baseline protection and company allocation. Rendered UI tests check the 120-row editor, saving, availability without teams and hidden admin controls for coaches. No real customer payments are created during tests.
