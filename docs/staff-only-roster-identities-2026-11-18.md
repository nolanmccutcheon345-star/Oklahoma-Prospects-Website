# Staff-only roster identity policy

Owner's November 16 master punch-list item 2 defines completion as no roster names visible to anyone not signed in as staff. This is stricter than the prior consent-filtered public roster.

This change suppresses roster identities in the anonymous public team projection, regardless of existing publication consent, and removes the public roster list renderer (including historical initial data). Existing authenticated, server-authorized staff roster access is preserved. Stored roster/consent/financial records, own-account records and coach listings are unchanged. Family schedules and messages remain available, but teammate roster/stat identities are now staff-only. Both activity and individual-stat endpoints enforce this on the server. Identity-keyed rendering drops private state immediately on logout, pending identity, account or team changes. No migration.

Anonymous HTTP checks before this change found a null session and no staff panel in HTML. A prior release rejected the staff endpoint with Unauthorized. These checks did not prove a reported anonymous full-staff-roster disclosure; the current policy gap is intentional public listing of consented names. Current exact-release endpoint and isolated hydrated-browser verification remain required, as do all normal build/CI/preview release gates. Do not claim production fixed before verified release.

## Local verification
- Independent code review completed; logout/account/team/player/pending/stale-response regression coverage added.
- Targeted roster/activity/consent tests: 19 passed. Dynamic/SSR roster render tests: 5 passed. Organization game-result tests after the policy expectation update: 7 passed.
- Full suite: 1,545 tests, 1,542 passed, 3 failed. One failure was the old consented-public-name expectation, corrected afterward and its complete 7-test file rerun green. Remaining two failures are existing real-browser availability/time-input tests: packaged Chromium unavailable; official browser download failed, and installed system Chromium launch is denied by this execution sandbox's socket restrictions. No test gates were removed or assertions about financial preservation weakened.
- Typecheck, Netlify-format build and built SSR smoke passed during implementation. A final clean-source build is required after the commit. Full CI/browser/isolated hosted preview and production verification still pending. Nothing deployed.
