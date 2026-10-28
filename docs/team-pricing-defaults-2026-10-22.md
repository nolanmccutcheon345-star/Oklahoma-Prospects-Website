# Editable team pricing defaults — October 22, 2026

## Owner-approved defaults

All new teams and known inherited draft settings use these saved configuration values:

| Setting                                      | Default                                        |
| -------------------------------------------- | ---------------------------------------------- |
| Full-player and pitcher-only team membership | $80 per player per billable month              |
| Team contingency                             | 12.5% of the existing direct-cost basis        |
| Deposit                                      | 70%, 14 weeks before the first scheduled event |
| Second payment                               | 15%, 10 weeks before the first scheduled event |
| Final payment                                | 15%, 6 weeks before the first scheduled event  |

The initial values are database release data in migration 0099. The master editor saves owner changes in the existing versioned master matrix. Runtime calculations do not force prices back to release values after a master save. Existing age/sport/season row overrides are retained. Required team membership is included exactly once. Organization fees and coach costs are unchanged. As of the October 24 owner directive, personal memberships are purchased separately through the site at the full published price; team pricing has no membership add-on or retail-reference setting.

Billing continues to count each calendar month touched by the configured season, including partial months. For example, February 15–May 31 is four billable months ($320 at $80/month). An explicit billable-month override requires its existing explanation. Service revenue recognition still uses prorated service dates; billing and recognition are separate.

## Inheritance and review

Membership (full and PO), contingency, and the event payment rule have explicit per-team inheritance metadata. Editing one makes that setting an override, even when its number matches the current master. Reset to master default restores inheritance. Other cost inputs retain their existing snapshot behavior.

Legacy plans with a known matrix origin are classified against the previous common/row defaults: differing amounts or custom schedules are retained as overrides. Plans without reliable matrix lineage retain their values and appear under **Teams requiring admin review**. An owner can confirm those values or reset individual settings. Historical data cannot establish an undocumented same-value override; new edits record explicit override metadata.

Saving master changes atomically updates linked draft values and history with the master revision, including the active financial basis when present. A published budget is preserved before any draft interpretation. Published offers, accepted locks, payments, credits, refunds, and historical basis versions are never rewritten by release defaults. Closed plans remain unchanged. A draft that differs from published terms is flagged for an explicit reviewed republication. Existing accepted agreements stay locked even after republication.

## Dates and installments

The earliest non-canceled team activity (practice, game, or tournament), or independently selected catalog event, within the configured season supplies the date. Active financial seasons use their authorized financial event commitments; operational schedule edits alone do not amend frozen financial terms. Canceled schedule mirrors are excluded. ISO timestamps are converted to America/Chicago; date-only values and week subtraction use calendar dates without host-timezone or daylight-saving drift.

Missing event or season dates leave the schedule incomplete and block publication. Past-due dates require an owner review reason bound to the current schedule. Changing the event date, season, percentages, or offsets invalidates that review. No charge, late fee, or roster action happens automatically. Existing final-deadline acceptance protection remains: an expired offer must be deliberately revised before a new family accepts it.

Amounts use integer cents. The first two percentages are rounded to cents (bounded by remaining total); the final installment receives the exact remainder. $2,525 splits into $1,767.50, $378.75, and $378.75. Event-based dates are stored verbatim in the publication and accepted plan rather than moved to acceptance day. Legacy agreements retain their original scheduling behavior.

## Validation

- 120 matrix rows across three season-length edge cases: 360 new-default calculations; unchanged direct-cost/contingency basis and one membership allocation.
- Example installment, odd-cent/zero/large amounts, partial calendar months, leap day, Chicago date conversion, missing dates, review invalidation, same-value and zero overrides.
- Migrated disposable database: owner-only master updates, atomic draft propagation, accepted schedule and cash/history preservation, publication review flags, concurrency through existing financial-context regressions.
- Component interactions in legacy and active-basis modes: editable master percentages, team override and reset controls, inherited values, permission-limited coach views.
- Required repository build, typecheck, regression, responsive/browser, lint and dependency gates apply to the released commit.

Production team names and balances are not copied into source or this report. Review affected teams in **Front Office → Team Fees & Profitability → Master budget defaults → Teams requiring admin review**. This release does not publish individual team fee agreements or charge families.
