# Assessment customer totals — owner update October 5, 2026

Claim: GB-07 / R2 assessment price only. Base `ec06d2313e8d31447e676a10e6b69ada1e101c9e`. This separate branch preserves PR #27 and the other bots' branches. It overlaps PR #30 only in `pricing.ts`; retain #30's independent currency helper when integrating.

New Pitcher (`s1`) and Hitting (`s9`) Assessments cost exactly $149 including processing. Shared `PRICES`, public catalog mapping, editable catalog normalization and Square approved-product quotes use the same current totals. Saved bookings/payments and historical migrations are not rewritten. Catching/fielding/reassessment prices, ordinary lesson prices and setup/eligibility logic are unchanged by this focused update.

The earlier formula derived assessment prices from an ordinary lesson plus $50; that formula is replaced by explicit owner-approved assessment totals. A separately purchased completed assessment satisfies setup under the owner requirements, but completing that workflow and the youth exemption are separate pending implementation. Do not turn on broader checkout merely because the two prices changed.

Acceptance: both approved products quote 14900 cents without an added processing/setup fee; tampered editable dollar rows still resolve to the approved price; historical price fixtures remain historical. Existing processing, Square and commerce regression checks cover the changed amounts. Production publication is authorized by Nolan's later instruction; actual release and remaining dependency/Netlify access gates must be recorded separately.
