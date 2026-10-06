# Dependency security continuation — October 6, 2026

Claim: existing release dependency audit blocker. Base main `e7f5515a3e8af1684f8e1fbc300183cda05d5ba2`. Separate branch `fix/dependency-security`; existing bot and continuation branches are preserved. No application, checkout, payment, database, environment, scheduler or customer-facing policy changes.

## Available patches applied

| Package | Previous | Updated | Advisory |
| --- | --- | --- | --- |
| sharp | 0.35.4 | 0.35.5 | GHSA-wq5f-xc86-pv6w |
| source-map-js | 1.2.1 | 1.2.2 | GHSA-68fv-2mgg-jv7q |
| smol-toml | 1.8.0 | 1.9.0 | GHSA-r4xh-jqrq-34v2 |

The sharp override remains pinned, now to the patched release. Its platform binaries and libvips packages are updated consistently. No other package version changed. Preserve existing nested lockfile entries: npm 11 initially removed copies that CI's npm 10 still requires; the first CI run caught this incompatibility and the follow-up restores them. A fresh `npm ci --ignore-scripts --no-audit --no-fund` succeeded in an independent installation; npm 10 validation and exact-head CI results are recorded in the PR.

Full audit before: 14 high, 1 moderate. After: 12 high, 0 moderate. The three patched packages no longer appear in the audit. The remaining 12 entries trace to braces and node-forge via Netlify development tooling. Primary advisories GHSA-vfj7-8cjw-p6xm and GHSA-86w9-cpqp-85rv, and the npm registry, still report no published fixed release. Do not invent patched versions, weaken CI's audit threshold, bypass branch protection or mark the remaining findings resolved. Square sandbox acceptance is unrelated to this patch.

## Verification

Typecheck and full lint PASS. All 574 offline regression tests PASS on Node 24. Netlify deploy-preview-context build and existing built SSR/security checks PASS. Native sharp SVG-to-PNG conversion PASS with sharp 0.35.5 and librsvg 2.63.2. Exact-head GitHub CI results are recorded in the PR. No hosted mutable tests, financial actions, real messages or database migrations were performed. Browser hydration/mobile verification is not claimed by the dependency checks.

## Handoff

A1 should reference this patch once in the shared backlog and retain the unresolved dependency gate separately from completed owner requirements. PR #34 public branding and discovery, PR #33 cancellation flows, and the bots' PRs remain independent. Production publishing is authorized, but this patch is not itself a production release; record an actual reviewed integration and live verification separately.
