# Team travel stipend and funding notice

Admins set Nightly hotel stipend in Team Fees & Profitability → Direct team costs. Coaches use Local / Travel and Overnight stays on games and tournaments in the shared team schedule. Day trips use zero nights. Enter a tournament's hotel nights once on the tournament, not again on each of its games.

The server sums stays for non-cancelled games/tournaments whose date falls within the fee plan's season start/end. Nights × admin nightly rate is added to fixed shared team costs before the existing contingency, allocation and processing calculations. Existing manual Hotels/Coach travel lines are retained; staff should not enter the same stipend twice. The default rate is zero until an admin sets it.

Schedule edits update the plan's calculated nights and revision in the same transaction and flag changed totals for review. Admin saves and publication rederive nights from saved activities, ignoring client-supplied totals. Changing season dates recalculates on save. Coaches cannot change the rate or publish fees. Draft fees change automatically; published offers and accepted fee/payment locks follow the existing admin approval process. Financially closed plans remain closed.

The authenticated Team funding status notice appears in team fee workspaces and on team detail pages. Admins, assigned coaches and linked parents can view it. Player-only, anonymous and unrelated accounts cannot fetch the aggregate. It returns only overduePlayers and tracking: no names, payment amounts, private team budgets or account identifiers.

Count one player once when an accepted fee agreement has an unpaid installment due before today in America/Chicago. Payments and approved credits reduce arrears. Future installments, unsigned offers and removed players are excluded. Roster Hold players remain counted. The message states that unpaid fees put planned activities at risk and Prospects does not advance funds to cover unpaid player balances. It does not claim an event has been cancelled or impose new charges. Notices reload on page focus and local team changes.

No database migration is required; new optional activity fields and defaulted budget fields are compatible with existing records. Tests use synthetic data only.
