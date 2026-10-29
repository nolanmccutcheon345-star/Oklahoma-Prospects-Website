# Parent and coach enrollment persistence repair

Release candidate based on production `53ad53f` (PR #240 already merged).

## Demonstrated failures repaired

- A real saved annual waiver with a recruiting roster link was reported missing because enrollment only consulted development links. Enrollment, the parent guide, progress, clearance and coach waiver status now resolve both explicit sources, requiring one athlete and the matching household. Conflicting, missing, withdrawn or cross-household links fail closed and request office review. No name matching, production backfill or automatic clearance is performed.
- Idempotent signature retries now return the original receipt. Changed signed details return an explicit correction-required outcome and preserve the signed record. A successful save followed by failed refresh remains visibly confirmed; refresh never signs again.
- Enrollment carries team, player and authorized athlete context into the waiver page. Existing current waivers suppress the signature form. The return link preserves the selected enrollment. Unknown athletes still fail household authorization.
- Explicit staff/development-coach deactivation overrides stale roster email assignments in operational identity, enrollment and development access, while retaining legitimate guardian access. Team-only coaches need not have a lesson-staff record.
- Coach paperwork uses saved waiver status rather than a manually set waiver flag. The legacy checklist no longer claims participation clearance. Save operations expose pending, saved, failed and unsaved states, prevent overlapping saves and warn before leaving with unsaved changes.
- Owner development-link writes reject cross-household or conflicting recruiting identities.

## Evidence required before release

Run typecheck, targeted real-function persistence/identity regressions and DOM failure-state tests, build and SSR checks, then all required GitHub checks at the final SHA. The compiled enrollment browser walkthrough signs annual waivers for two synthetic siblings through the actual application (no seeded waiver or development link), verifies reload and fresh session, confirms coach status, saves/reloads coach roster edits, and retains fee draft/review/publication/invitation and privacy checks. Existing full-suite tests remain mandatory.

Fixtures never use production storage, send family email or make live provider payments. The hosted smoke verifies HTTP behavior only; the production manifest and Netlify commit must match the merged release. Record deployment and final check receipts in the PR.

## Preserved boundaries and remaining decisions

- No accepted fee, signed packet, signed waiver, roster publication consent, Square activation flag or production financial record is changed by this repair.
- Public roster consent is still required by the existing annual waiver policy; changing that requirement is an owner policy decision. Optional enrollment media consent remains separate.
- Ambiguous or missing athlete mappings require an owner to verify the identity. Do not merge by name or ask families to duplicate athlete accounts. Correcting signed details requires review and a separately designed amendment record; this release explicitly reports that the original was retained.
- Actual inbox delivery, real iPhone/VoiceOver behavior and live Square payment/collection readiness are separate verification boundaries. No real charges are authorized by this release.
- The audit's moderate seroval dependency advisory requires a separately tested compatible dependency update; no dependency change is bundled into the enrollment incident repair.
