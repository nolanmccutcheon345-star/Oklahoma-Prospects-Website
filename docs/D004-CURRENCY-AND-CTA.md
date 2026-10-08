# D-004 — currency formatting and cage-rate button

The homepage, booking funnel and training catalog now route dollar-denominated display amounts through the existing shared cents currency formatter. Rates, line items, totals and Review labels show two decimals. Numeric quote values and approved prices are unchanged; the owner's $149 assessment/youth pricing work remains a separate implementation requirement.

At narrow widths, the homepage Cage Rates button sits below the introduction at full width with a 44px minimum height and no wrapping; larger widths retain the row layout.

Base: main `ec06d2313e8d31447e676a10e6b69ada1e101c9e`. Claimed files: `src/lib/pricing.ts` (formatting helper only), `src/routes/index.tsx`, `src/routes/book.tsx`, `src/routes/training.tsx`, this note. Existing PR #26 and #27 changed-file sets do not overlap this branch. Older reconciliation PR #20 includes book/training history; integrate its already-released behavior deliberately rather than bulk merging it over this fix. No inquiry-flow or pricing-policy change is claimed.

A3/A4 acceptance: desktop and 390px width, all displayed money uses two decimals; Cage Rates CTA is one line, at least 44px tall and fully visible. Exact viewport/render verification must be recorded on the tested commit before release. Production publishing remains locked; no forms, bookings, payments or customer messages are performed by this fix.
