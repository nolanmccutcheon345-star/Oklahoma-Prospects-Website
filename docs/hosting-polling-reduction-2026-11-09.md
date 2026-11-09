# Hosting polling reduction, November 9, 2026

## Verified findings

Production Netlify site `c49ad0ab-1b2c-412e-88d9-1f6ddf490a17` reported deploy `6af16b6ebd100d405eb0bb75`, source `c3fdf3b22fe1cf69e984b65d1a4d8fc74c1a36e5`, at inspection. This patch is based on current main `78c14bc5017f9c59ddd44ab39b312010d58aab3d` and is not published.

Netlify observability from November 3 00:00 UTC through November 9 approximately 13:22 UTC reported:

- Enrollment guide: 19,151 requests.
- Coordinator account entry: 10,323 requests.
- Site-alerts API: 9,198 requests.
- Training inbox: 5,139 requests.
- Team Hub: 2,801 requests.

The server-function hashes were resolved against this branch's generated server manifest. Request counts are not billed compute totals; no dollar reduction is established. Enrollment guide and Team Hub already skip polling when hidden. Linux Chrome user-agent strings alone do not establish abusive traffic.

Production schedules include journal publication, site alerts, team collections and tryout notifications every minute. Site alerts also performs coordinator security-risk checks and recovery monitoring. Do not blindly reduce these schedules: they affect timeliness, and some workers already return without processing when their feature is disabled. Database compute attribution still needs billing evidence.

## Small, reversible change

Coordinator account entry, coordinator home, training inbox and public program updates previously continued read requests while the browser tab was hidden. These now share a visibility-aware poller that:

- Preserves the existing 30-second or 60-second visible polling cadence.
- Skips requests while hidden and refreshes immediately on visibility/focus return.
- Prevents overlapping automatic requests and removes listeners/timers on unmount.
- Retries after errors without discarding the component's existing error handling.

Each fully hidden hour avoids up to 120 scheduled requests per 30-second poller or 60 per 60-second poller, relative to the configured timer cadence. Actual browser throttling and tab usage affect realized savings. Existing in-flight requests may finish after a tab becomes hidden. Hidden content remains at its last fetched state until the return refresh completes. These are UI reads only; backend permissions, booking, payment processing, reminders, security jobs and cron timing are unchanged.

## Verification

Passed: three focused polling regression tests covering hidden mounts, 120 hidden ticks without requests, immediate return refresh, duplicate events, no concurrent requests, cleanup, and rejection recovery; TypeScript; production Netlify-adapter build; built SSR smoke checks; focused ESLint; full ESLint (zero errors, 97 existing warnings); diff whitespace check.

The isolated SSR smoke emitted expected unavailable-database/public-feed diagnostics and returned success. It did not use production data. Full CI/browser walkthroughs, provider transactions and production behavior are not certified by these focused checks. No deploy or paid action was performed.

Sources: https://app.netlify.com/projects/oklahoma-prospects and repository source/components plus the generated server-function manifest.
