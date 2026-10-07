# Continuation batch 9 — release handoff

All nine fixes are merged and live as `c6463d4878e4e682721bbd0200b7f01b726994c4`. Production `/release.json` matched this commit with dirty=false; GET `/`, `/book`, `/training`, `/login` and `/teams` returned 200. The final main tree equals the CI-tested PR #92 tree (`6425d30ee23ff5977cab7aac0aa43c441b2f31fc`).

| Order | PR | Change |
|---|---|---|
| 1 | #86 | fix: prevent new coach identifier collisions |
| 2 | #85 | fix: reject blank coach identities and normalize team access |
| 3 | #87 | fix: remove remaining billing status from player roster responses |
| 4 | #93 | fix: hide staff employment records from family team views |
| 5 | #88 | fix: protect athlete row identifier ownership during scoped saves |
| 6 | #89 | fix: reject duplicate prescription versions before appending history |
| 7 | #90 | fix: reject duplicate newly submitted development messages |
| 8 | #91 | fix: validate unique team and team-local staff identifiers |
| 9 | #92 | fix: project development viewers without internal identity grants |

Validation: all nine exact heads passed npm ci, typecheck, full tests, lint, high-severity dependency audit, build and built-SSR verification. Combined local suite: 629 passed, zero failed or skipped. Preview manifests matched all heads, with dirty=false. Eight previews returned 200 on all five pages; PR #85 /book timed out twice, while its other pages and final production /book returned 200.

Scope and remaining work: no Square acceptance or real payment/refund/customer messaging was exercised. No hosted authenticated-role or browser visual acceptance is claimed. No production migrations or scheduler edits. Existing bots' fourteen branches (#18,19,20,25,26,27,30,33,36,37,38,39,40,41) retained their recorded heads before merging. PR #33 shares desk-impl.server.ts: new coach-ID helper and viewer-return projection are now on main; reconcile those narrow hunks when advancing its refund changes. Coach IDs already stored are retained; this does not repair historic duplicates.

Previous pending PRs #82–84 were merged before this batch, superseding their earlier blocked status. Owner decisions remain authoritative, including membership refunds based on individual lesson value to the original card; those pending provider/refund features are not claimed complete by these nine fixes.
