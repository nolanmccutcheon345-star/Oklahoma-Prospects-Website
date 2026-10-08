# October 5 focused release candidate

Owner authorization: Nolan lifted the production publish restriction. Netlify dashboard was independently observed signed in as Steve, with auto publishing already on. No publish setting was changed here.

This candidate combines PR #31 at 1b7e0297f0e638731bd6b43075ea2710c95f1c9d (exact $149 pitching/hitting assessment totals) with PR #29 at 199c52ad0c3b67a15622776a639187540525f54f (auth email context guard). No existing bot branch is overwritten or deleted. Owner requirements are included for Thursday reconciliation. PRs #26, #27, #25 and #30 remain separate.

No new dependency, migration, credential, checkout-scope or scheduler setting is included. Standard auth email remains available in known production contexts. Unknown contexts fail closed; previews can send only to exact configured test recipients. New assessment quotes use 14900 cents; historical payments remain unchanged.

Known unresolved audit: full npm audit reports 12 high entries in existing Netlify development tooling, rooted in braces GHSA-vfj7-8cjw-p6xm and node-forge GHSA-86w9-cpqp-85rv, with no available patched version. Runtime-only audit reports zero. CI's full audit is not suppressed, rewritten or reported as passing. No branch protection is bypassed; merge must use the normal exact-head GitHub API and be rejected if required protections block it.

This release does not activate the broader lesson checkout, implement youth exemption, household refund allowance, remote fulfillment, tryout administration, player permissions or fundraising consent. Those remain tracked owner requirements and must not be marked complete.

Review/build results and actual production commit/deploy/live checks must be recorded after completion. Rollback reference supplied and previously observed: Netlify deploy 6abd9b2bcb21a7428799533c.
