# Processing-inclusive prices — September 21, 2026

Owner request: include processing in every posted price, including the Prospects register. This release budgets 2.9% + $0.30 into the product price for all payment methods. It does not add a checkout surcharge. Actual processor rates can differ from this budget.

Rentals cover a minimum 30-minute purchase and round up to $0.25 per half-hour: household $52.50/hour, team $62.50/hour, field $78/hour. Other products round up to whole dollars. The separate first-month no-assessment business charge becomes $52. Free tryouts remain free. Discounts remain intentional reductions from the posted price.

| Product | Posted price |
|---|---:|
| Prospect cage pass | $82/month |
| All-Star cage pass | $144/month |
| Elite Family cage pass | $206/month |
| Development | $247/month |
| Performance | $401/month |
| Elite Hybrid | $463/month |
| Small-group | $165/month |
| Remote HS Pitching | $185/month |
| 4 × 30-min package | $227 |
| 4 × 60-min package | $397 |
| 8 × 60-min package | $763 |
| New Pitcher Assessment | $154 |
| Hitting Assessment | $155 |
| Private 30 min | $63 |
| Private 60 min | $104 |
| Pitching Lab/reassessment | $134 |
| Remote video review | $47 |

New team offers budget processing once into the season total, allowing up to the existing maximum of 12 installments plus a deposit and retaining the configured rounding step. Card and ACH payment records have no new surcharge. Signed fee locks and locked payment schedules are honored. Historical records and receipts are not rewritten. Current paid/failed renewal and refund tests continue to use their original saved financial snapshots.

The additive migration widens `club_services.price` to two decimal places and updates only the current catalog. Public catalog mapping and admin input preserve cents; checkout retains its server-approved price and stale-total guards. Membership per-hour/savings labels follow the current catalog.

Existing Square subscription objects are not repriced. New enrollment requires Square plans at the new amounts: the owner’s normal Prepare monthly plans action creates new price-specific variations, preserving existing subscriptions. Configured overrides at an old amount fail closed and must be reviewed. Product availability and the cage-only live checkout gate remain unchanged.

## Verification and remaining publication

The register is published at https://prospects-concessions-register.stevemccutcheon89.chatgpt.site (version 15, source cc34d8da6f9faa05057da7d9994e1622a98e47a2; deployment succeeded). It is a separately hosted application. Its source projects database net targets once to posted prices, preserves stock and historical sales, removes the Cash App add-on, and rejects mismatched displayed totals. It does not modify Square POS item prices or Square account surcharge settings; staff must charge the amount displayed in the register without another processing fee.

Website local verification covers migrated PostgreSQL, catalog/checkout equality, cents, discount codes, team fees, locked agreements, payment/refund/renewal snapshots, TypeScript, production build and built server response checks. No real customer charge or subscription was created. Hosted browser/payment acceptance is pending because the Netlify CLI session is not authenticated. The public website must not be described as updated until a verified production deployment succeeds.

Production currently uses a manually deployed, locked release. Its old Git build connection is stopped. Publishing this branch therefore requires the authenticated Netlify release workflow; pushing GitHub alone does not update prospectsbaseball.club. Build with CONTEXT=production, apply the standard additive migrations, publish and verify the intended release, and preserve the existing release lock.


## Publication blocker recorded at handoff

All 502 tests passed; a final focused team-pricing run passed 18 tests after retaining the previous rounded season-price target. TypeScript, production build, built-server checks and changed-file lint (zero errors) passed. No new website deployment completed.

Automatic approval review rejected GitHub create_tree twice. It required explicit permission to publish modified source to the public `nolanmccutcheon345-star/Oklahoma-Prospects-Website` repository, even after read-only verification of the connected user's admin/push rights and that repository's README identifying prospectsbaseball.club. Do not retry the upload until that explicit approval is supplied. The complete change is committed locally on `processing-inclusive-prices`; no PR or remote branch was created.

Netlify CLI login is awaiting owner reconnection. No Netlify credentials were retrieved or changed. Resume the supported authentication and release workflow after approval. Preserve current paid records, live gates, release locks, and existing subscription prices.

## Published release and catalog follow-up

PR #14 passed GitHub CI and was published from `89a823d631ae72490ad48d967ea3e1242561f2c9` on September 21, 2026 at 20:58 UTC. Netlify deployment `6ab19a5658d87dd6cfa6447f` is ready in production with its release lock restored. Netlify confirms migrations 0025 and 0026 applied; recovery snapshots were created before and during publishing. Public HTTP checks passed on preview and production, and browser checks verified rental prices and half-hour totals. See PR #14 for complete release evidence.

The final membership-page review identified older standalone monthly team rates and a few catalog defaults outside `PRICES`. The follow-up applies the same processing budget to those posted team rates and reads private lesson and development catalog defaults from shared current prices. Historical seed bookings retain their saved amounts. All-Star per-hour copy now follows its current monthly price.

| Team monthly plan (four visits) | 1 hour | 90 min | 2 hours |
|---|---:|---:|---:|
| One cage | $226 | $340 | $453 |
| Two cages | $412 | $618 | $824 |
| Field / team area | $298 | $443 | $566 |

These remain office-invoiced plans; the follow-up does not create or reprice existing invoices or subscriptions.
