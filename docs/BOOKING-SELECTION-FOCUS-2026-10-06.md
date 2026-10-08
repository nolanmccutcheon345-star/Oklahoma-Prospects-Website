# D-002a — booking selection and focus

Claimed by Codex continuation; base main after dependency PR #35, `6dfbcb8abf8303fc131f75d7b028938a0e22b7ed`. File claim: `src/routes/book.tsx`; existing PR #26 sticky chrome and PR #30 money formatting remain separate.

The cage booking mode is visibly marked Current and exposes `aria-current="location"`. Selected household/team and lane cards include a checkmark and Selected text, alongside their existing filled state. Native checked radio/checkbox semantics remain intact. Keyboard focus on the hidden native controls gives the visible label a 3px outline with a 4px offset, distinct from selection.

No booking state, pricing, resource IDs, eligibility, availability or payment logic changes. D-002b/W12 resource and fielding-rate reconciliation remains separate. Preserve the small eight-line source diff; avoid incidental route formatting that collides with PR #30.

Local TypeScript, changed-file lint, Netlify build and generated-function SSR/security checks PASS. Rendered `/book` and `/book?space=field` include the Current/Selected/focus markup and retain the existing checked fielding lane. This is markup verification, not keyboard or viewport acceptance. On the exact preview, verify keyboard focus visibility, distinct selected vs focused cards, 390×626 and 200% zoom before marking D-002a complete.

No form submissions, booking, sign-in, payment, database or production publication performed for this change. A1 should link this PR to D-002a once and retain D-002b as open. Other workers' branches are preserved.
